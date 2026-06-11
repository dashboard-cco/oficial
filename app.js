let state = {
  painel: [...DEMO.painel],
  operacoes: [...DEMO.operacoes],
  planejamento: [],
  dias: [],
  mes: "Todos",
  servico: "Todos",
  turno: "Todos",
  ra: "Todas"
};

let charts = {};
let map;
let mapBaseLayers = {};
let mapOverlayLayers = {};
let mapLayerControl = null;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const fmtNum = n => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtMoney = n => Number(n || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function get(row, names) {
  const k = Object.keys(row).find(x => names.some(n => norm(x) === norm(n)));
  return k ? row[k] : null;
}

function excelDate(v) {
  if (!v) return null;

  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }

  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);

  return null;
}

function titleRA(v) {
  const s = String(v || "").toLowerCase();
  return Object.keys(RA_COORDS).find(r => norm(r) === norm(s)) || String(v || "Sem RA");
}

async function carregarBanco() {
  if (!window.supabaseClient) {
    console.warn("Supabase não conectado. Usando base demonstrativa.");
    return;
  }

  const { data: ops, error } = await window.supabaseClient
    .from("operacoes")
    .select("*")
    .order("data", { ascending: true });

  if (error) {
    console.error("Erro ao carregar operacoes:", error);
    return;
  }

  if (ops && ops.length > 0) {
    state.operacoes = ops;
    $("#statusBase").textContent = "Banco Supabase";
    $("#statusDetalhe").textContent = `${fmtNum(ops.length)} registros carregados`;
  } else {
    $("#statusBase").textContent = "Base demonstrativa";
    $("#statusDetalhe").textContent = "Banco vazio. Importe a planilha.";
  }
}

function fillFilters() {
  const meses = [...new Set(
    state.operacoes
      .map(o => (o.data || "").slice(0, 7))
      .filter(Boolean)
  )].sort();

  $("#filtroMes").innerHTML =
    '<option value="Todos">Todos os meses</option>' +
    meses.map(m => `<option value="${m}">${m}</option>`).join("");

  $("#filtroServico").innerHTML =
    '<option value="Todos">Todos os serviços</option>' +
    Object.keys(SERVICOS).map(s => `<option value="${s}">${s}</option>`).join("");

  const ras = [...new Set(state.operacoes.map(o => o.ra).filter(Boolean))].sort();

  $("#filtroRA").innerHTML =
    '<option value="Todas">Todas as RAs</option>' +
    ras.map(r => `<option value="${r}">${r}</option>`).join("");
}

function filteredOps() {
  return state.operacoes.filter(o =>
    (state.mes === "Todos" || (o.data || "").startsWith(state.mes)) &&
    (state.servico === "Todos" || o.servico === state.servico) &&
    (state.turno === "Todos" || norm(o.turno) === norm(state.turno)) &&
    (state.ra === "Todas" || norm(o.ra) === norm(state.ra))
  );
}

function filteredPainel() {
  return state.painel.filter(p =>
    state.servico === "Todos" || p.servico === state.servico
  );
}

function metric(label, value, sub = "") {
  return `
    <div class="metric">
      <small>${label}</small>
      <strong>${value}</strong>
      <span>${sub}</span>
    </div>
  `;
}

function statusBadge(p) {
  const x = (p.percentual || 0) * 100;
  return `<span class="badge ${x < 60 ? "crit" : x < 80 ? "warn" : "ok"}">${x.toFixed(0)}%</span>`;
}

function avg(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

function group(arr, key, val) {
  const m = {};
  arr.forEach(x => {
    const k = key(x) || "Sem informação";
    m[k] = (m[k] || 0) + (val ? val(x) : 1);
  });
  return m;
}

function render() {
  const ops = filteredOps();
  const painel = filteredPainel();

  const totalPrev = painel.reduce((s, p) => s + (+p.previsto || 0), 0);
  const totalExec = painel.reduce((s, p) => s + (+p.acumulado || 0), 0);
  const eficiencia = totalPrev ? totalExec / totalPrev * 100 : 0;

  $("#scoreGeral").textContent = `${eficiencia.toFixed(0)}%`;

  $("#cardsResumo").innerHTML =
    metric("Execução geral", `${eficiencia.toFixed(1)}%`, "planejado x executado") +
    metric("Valor executado", fmtMoney(painel.reduce((s, p) => s + (+p.valor || 0), 0)), "estimativa por valores fixos") +
    metric("Serviços monitorados", painel.length, "P1 a P12") +
    metric("Registros operacionais", fmtNum(ops.length), "base filtrada");

  $("#cardsKpi").innerHTML =
    metric("Km executado", fmtNum(ops.reduce((s, o) => s + (+o.km_total || +o.km_executado || 0), 0)), "soma filtrada") +
    metric("Viagens", fmtNum(ops.reduce((s, o) => s + (+o.viagens || 0), 0)), "coletas e deslocamentos") +
    metric("Peso", fmtNum(ops.reduce((s, o) => s + (+o.peso_t || 0), 0)) + " t", "quando informado") +
    metric("Velocidade média", fmtNum(avg(ops.map(o => +o.velocidade_media || 0).filter(Boolean))) + " km/h", "média simples");

  renderTables(painel, ops);
  renderCharts(painel, ops);
  renderAlerts(painel);
  renderMap(ops);
}

function renderTables(painel, ops) {
  $("#tabelaResumo").innerHTML =
    "<thead><tr><th>Serviço</th><th>Nome</th><th>Acumulado</th><th>Previsto</th><th>Execução</th><th>Valor</th></tr></thead><tbody>" +
    painel.map(p => `
      <tr>
        <td><b>${p.servico}</b></td>
        <td>${p.nome || ""}</td>
        <td>${fmtNum(p.acumulado)} ${p.medicao || ""}</td>
        <td>${fmtNum(p.previsto)}</td>
        <td>${statusBadge(p)}</td>
        <td>${fmtMoney(p.valor)}</td>
      </tr>
    `).join("") +
    "</tbody>";

  $("#tabelaExecucao").innerHTML =
    "<thead><tr><th>Data</th><th>Serviço</th><th>RA</th><th>Turno</th><th>Circuito</th><th>Veículo</th><th>Km</th><th>Viagens</th><th>Peso</th></tr></thead><tbody>" +
    ops.slice(0, 600).map(o => `
      <tr>
        <td>${o.data || ""}</td>
        <td><b>${o.servico || ""}</b></td>
        <td>${o.ra || ""}</td>
        <td>${o.turno || ""}</td>
        <td>${o.circuito || ""}</td>
        <td>${o.veiculo || ""}</td>
        <td>${fmtNum(o.km_total || o.km_executado)}</td>
        <td>${fmtNum(o.viagens)}</td>
        <td>${fmtNum(o.peso_t)}</td>
      </tr>
    `).join("") +
    "</tbody>";
}

function chart(id, type, labels, data, label) {
  const canvas = $(id);
  if (!canvas) return;

  if (charts[id]) charts[id].destroy();

  const isDoughnut = type === "doughnut";
  const isLine = type === "line";
  const isBar = type === "bar";

  const dataset = {
    label,
    data,
    borderWidth: isLine ? 3 : 2,
    borderRadius: isBar ? 8 : 0,
    tension: isLine ? 0.35 : 0,
    fill: isLine,
    pointRadius: isLine ? 4 : 0,
    pointHoverRadius: isLine ? 6 : 0,
    backgroundColor: isDoughnut
      ? ["#13b981", "#4ade80", "#0ea5e9", "#f59e0b", "#ef4444", "#22c55e"]
      : isLine
        ? "rgba(19, 185, 129, 0.18)"
        : "rgba(19, 185, 129, 0.72)",
    borderColor: isDoughnut ? "#ffffff" : "#064e3b"
  };

  if (isBar) {
    dataset.barThickness = 24;
    dataset.maxBarThickness = 32;
    dataset.categoryPercentage = 0.55;
    dataset.barPercentage = 0.7;
  }

  charts[id] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [dataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      layout: {
        padding: { top: 8, right: 12, bottom: 8, left: 8 }
      },
      plugins: {
        legend: {
          display: isDoughnut || isLine,
          position: "bottom",
          labels: {
            color: "#0b201b",
            usePointStyle: true,
            boxWidth: 10,
            font: { size: 12, weight: "700" }
          }
        },
        tooltip: {
          backgroundColor: "#06231d",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 12,
          cornerRadius: 10
        }
      },
      scales: isDoughnut ? {} : {
        x: {
          ticks: {
            color: "#0b201b",
            autoSkip: true,
            maxRotation: 35,
            minRotation: 0,
            font: { size: 11, weight: "700" }
          },
          grid: { display: false },
          border: { color: "rgba(11,32,27,0.18)" }
        },
        y: {
          beginAtZero: true,
          suggestedMax: isBar ? Math.max(...(data || [0]).map(Number), 10) * 1.18 : undefined,
          ticks: {
            color: "#0b201b",
            font: { size: 11, weight: "700" }
          },
          grid: { color: "rgba(11,32,27,0.08)" },
          border: { display: false }
        }
      }
    }
  });
}

function renderCharts(painel, ops) {
  chart(
    "#chartServicos",
    "bar",
    painel.map(p => p.servico),
    painel.map(p => (p.percentual || 0) * 100),
    "Execução %"
  );

  const ra = group(ops, o => o.ra, o => +o.km_total || +o.km_executado || 1);
  chart(
    "#chartRA",
    "bar",
    Object.keys(ra).slice(0, 12),
    Object.values(ra).slice(0, 12),
    "Volume"
  );

  const dia = group(ops, o => o.data, () => 1);
  const dias = Object.keys(dia).sort();

  chart(
    "#chartDiario",
    "line",
    dias,
    dias.map(k => dia[k]),
    "Registros"
  );

  const turno = group(ops, o => o.turno, () => 1);

  chart(
    "#chartTurno",
    "doughnut",
    Object.keys(turno),
    Object.values(turno),
    "Turnos"
  );
}

function renderAlerts(painel) {
  let html = "";

  painel.forEach(p => {
    const pct = (p.percentual || 0) * 100;

    if (pct < 60) {
      html += `<div class="alert red"><b>${p.servico} crítico</b><br>Execução em ${pct.toFixed(1)}%. Requer plano de ação imediato.</div>`;
    } else if (pct < 80) {
      html += `<div class="alert yellow"><b>${p.servico} em atenção</b><br>Execução abaixo do padrão presidencial: ${pct.toFixed(1)}%.</div>`;
    }
  });

  $("#alertas").innerHTML = html || '<div class="alert"><b>Sem alertas críticos</b><br>Todos os serviços filtrados estão em conformidade operacional.</div>';
}

function renderMap(ops) {
  if (!$("#map") || typeof L === "undefined") return;

  if (!map) {
    map = L.map("map", {
      center: [-15.79, -47.88],
      zoom: 10,
      layers: []
    });

    mapBaseLayers = {
      "Claro / Branco": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }),
      "Preto / Escuro": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CARTO"
      }),
      "Satélite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles © Esri"
      })
    };

    mapOverlayLayers = {
      "Bolinhas por RA": L.layerGroup().addTo(map),
      "Nomes das RAs": L.layerGroup()
    };

    mapBaseLayers["Claro / Branco"].addTo(map);
    mapLayerControl = L.control.layers(mapBaseLayers, mapOverlayLayers, { collapsed: false }).addTo(map);
  }

  mapOverlayLayers["Bolinhas por RA"].clearLayers();
  mapOverlayLayers["Nomes das RAs"].clearLayers();

  const ras = group(ops, o => titleRA(o.ra), () => 1);

  Object.entries(ras).forEach(([ra, qtd]) => {
    const c = RA_COORDS[ra];
    if (!c) return;

    const color = qtd > 100 ? "#13b981" : qtd > 30 ? "#d9b45f" : "#e95f5f";

    L.circleMarker(c, {
      radius: Math.max(8, Math.min(28, Math.sqrt(qtd) * 3)),
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.72
    })
      .bindPopup(`<b>${ra}</b><br>${qtd} registros<br>Lote 01`)
      .addTo(mapOverlayLayers["Bolinhas por RA"]);

    L.marker(c, {
      interactive: false,
      icon: L.divIcon({
        className: "ra-label",
        html: `<span>${ra}</span>`,
        iconSize: [120, 24],
        iconAnchor: [60, 12]
      })
    }).addTo(mapOverlayLayers["Nomes das RAs"]);
  });

  setTimeout(() => map.invalidateSize(), 120);
}

function mesesImportados(registros) {
  return [...new Set((registros || [])
    .map(r => String(r.data || "").slice(0, 7))
    .filter(Boolean))];
}

function servicosImportados(registros) {
  return [...new Set((registros || [])
    .map(r => r.servico)
    .filter(Boolean))];
}

function ultimoDiaMes(yyyyMm) {
  const [ano, mes] = yyyyMm.split("-").map(Number);
  return new Date(ano, mes, 0).getDate();
}

async function sobreporPeriodoNoBanco(ops, planejamento, dias) {
  if (!window.supabaseClient || !ops || ops.length === 0) return;

  const meses = mesesImportados(ops);
  const servicos = servicosImportados(ops);

  for (const mesRef of meses) {
    const inicio = `${mesRef}-01`;
    const fim = `${mesRef}-${String(ultimoDiaMes(mesRef)).padStart(2, "0")}`;

    let q = window.supabaseClient
      .from("operacoes")
      .delete()
      .gte("data", inicio)
      .lte("data", fim);

    if (servicos.length) q = q.in("servico", servicos);

    const { error } = await q;
    if (error) {
      console.error("Erro ao sobrepor período em operacoes:", error);
      alert(`Erro ao sobrepor operacoes: ${error.message}`);
      throw error;
    }
  }

  if (dias && dias.length) {
    for (const d of dias) {
      if (!d.ano || !d.mes) continue;
      const { error } = await window.supabaseClient
        .from("dias_operacao")
        .delete()
        .eq("ano", d.ano)
        .eq("mes", d.mes);
      if (error) console.warn("Não foi possível sobrepor dias_operacao:", error);
    }
  }

  // Planejamento não é apagado automaticamente porque pode ser base fixa de vários meses.
  // Se desejar substituir a tabela toda, faça isso manualmente no Supabase.
}

async function salvarNoSupabase(tabela, registros) {
  if (!window.supabaseClient) {
    console.warn("Supabase não conectado. Não salvou:", tabela);
    return false;
  }

  if (!registros || registros.length === 0) {
    console.warn("Nenhum registro para salvar em:", tabela);
    return false;
  }

  const chunkSize = 500;

  for (let i = 0; i < registros.length; i += chunkSize) {
    const lote = registros.slice(i, i + chunkSize);

    const { error } = await window.supabaseClient
      .from(tabela)
      .insert(lote);

    if (error) {
      console.error(`Erro ao salvar em ${tabela}:`, error);
      alert(`Erro ao salvar em ${tabela}: ${error.message}`);
      return false;
    }
  }

  return true;
}

async function limparBancoAntesImportar() {
  if (!window.supabaseClient) return;

  await window.supabaseClient.from("operacoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await window.supabaseClient.from("planejamento").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await window.supabaseClient.from("dias_operacao").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

async function importar(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const required = [
    "Painel Executivo",
    "P1",
    "P2.1",
    "P2.2",
    "P3",
    "P4",
    "P5",
    "P6",
    "P7",
    "P8",
    "P9",
    "P10",
    "P11",
    "P12",
    "BancoDados_",
    "Dias_Operação"
  ];

  $("#validacaoAbas").innerHTML = required.map(s =>
    `<div class="check ${wb.SheetNames.includes(s) ? "" : "miss"}">${wb.SheetNames.includes(s) ? "✓" : "✕"} ${s}</div>`
  ).join("");

  let painel = [];
  let ops = [];
  let planejamento = [];
  let dias = [];

  if (wb.Sheets["Painel Executivo"]) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Painel Executivo"], { defval: null });

    painel = rows.map(r => {
      const serv = get(r, ["Serviço", "Servico"]);
      const acumulado = +get(r, ["Acumulado no Mês", "Acumulado no Mes"]) || 0;

      return {
        servico: serv,
        nome: get(r, ["Nome Serviço", "Nome Servico"]) || SERVICOS[serv],
        acumulado,
        medicao: get(r, ["Medição", "Medicao"]),
        previsto: +get(r, ["Previsto"]) || 0,
        percentual: +get(r, ["Porcetagem de Execução no Mês", "Porcentagem de Execução no Mês"]) || 0,
        dias: +get(r, ["Dias acumulado"]) || 0,
        total_dias: +get(r, ["Total de Dias no Mês ", "Total de Dias no Mês"]) || 0,
        valor: (VALORES_FIXOS[serv] || +get(r, ["Valor "]) || 0) * acumulado
      };
    }).filter(r => r.servico);
  }

  Object.keys(SERVICOS).forEach(serv => {
    const sh = wb.Sheets[serv];
    if (!sh) return;

    const rows = XLSX.utils.sheet_to_json(sh, { defval: null, raw: false });

    rows.forEach(r => {
      const inicio = get(r, ["Início Operação", "Inicio Operação", "Data Análise", "Data"]);
      const data = excelDate(inicio || get(r, ["Data"]));

      if (!data) return;

      ops.push({
        servico: serv,
        data,
        ra: titleRA(get(r, ["Ra", "RA", "Região Administrativa"])),
        turno: get(r, ["Turno", "turno"]),
        veiculo: get(r, ["Veículo", "Veiculo"]),
        circuito: get(r, ["Circuito", "Código do circuito", "Codigo do circuito"]),
        km_total: +get(r, ["Km_Total", "Km Total", "Km Executado", "Total Pagamento - KM"]) || 0,
        km_executado: +get(r, ["Km Executado", "Total Pagamento - KM"]) || 0,
        viagens: +get(r, ["Viagens", "Qtd_Viagem", "Qtd Viagem"]) || 0,
        peso_t: +get(r, ["Peso(T)", "Peso T", "Peso"]) || 0,
        velocidade_media: +get(r, ["Velocidade Média", "Velocidada Média"]) || 0,
        qtd_equipe: +get(r, ["Qdt_Equipe", "Qtd_Equipe", "Equipe"]) || 0
      });
    });
  });

  if (wb.Sheets["BancoDados_"]) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["BancoDados_"], { defval: null });

    planejamento = rows.map(r => ({
      circuito: get(r, ["Circuito", "Código do circuito", "Codigo do circuito"]),
      ra: titleRA(get(r, ["RA", "Ra", "Região Administrativa"])),
      frequencia: get(r, ["Frequência", "Frequencia"]),
      tipo_servico: get(r, ["Tipo Serviço", "Tipo Servico", "Serviço", "Servico"]),
      turno: get(r, ["Turno"]),
      km_planejado: +get(r, ["Km Planejado", "KM Planejado", "Km Previsto"]) || 0
    })).filter(r => r.circuito || r.ra);
  }

  if (wb.Sheets["Dias_Operação"]) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Dias_Operação"], { defval: null });

    dias = rows.map(r => ({
      mes_nome: get(r, ["Mês", "Mes"]),
      mes: +get(r, ["Número Mês", "Numero Mes", "Mes número", "Mês número"]) || null,
      ano: +get(r, ["Ano"]) || 2026,
      dias_operacao: +get(r, ["Dias_Operação", "Dias Operação", "Dias_Operacao", "Dias Operacao"]) || 0
    })).filter(r => r.mes_nome || r.dias_operacao);
  }

  console.log("REGISTROS PARA IMPORTAR:", ops);

  state = {
    ...state,
    painel: painel.length ? painel : state.painel,
    operacoes: ops.length ? ops : state.operacoes,
    planejamento,
    dias
  };

  $("#statusBase").textContent = "Sobrepondo período no Supabase...";
  $("#statusDetalhe").textContent = `${fmtNum(ops.length)} registros encontrados`;

  await sobreporPeriodoNoBanco(ops, planejamento, dias);

  const salvouOps = await salvarNoSupabase("operacoes", ops);
  await salvarNoSupabase("planejamento", planejamento);
  await salvarNoSupabase("dias_operacao", dias);

  if (salvouOps) {
    $("#statusBase").textContent = "Banco Supabase";
    $("#statusDetalhe").textContent = `${fmtNum(ops.length)} registros importados`;
    alert(`Importação concluída: ${ops.length} registros sobrepostos/salvos no Supabase. Os outros meses foram preservados.`);
  } else {
    $("#statusBase").textContent = "Planilha importada localmente";
    $("#statusDetalhe").textContent = `${fmtNum(ops.length)} registros lidos, mas não salvos`;
  }

  $("#jsonPreview").textContent = JSON.stringify({
    arquivo: file.name,
    servicos: painel.length,
    registros_operacionais: ops.length,
    planejamento: planejamento.length,
    dias_operacao: dias.length
  }, null, 2);

  fillFilters();
  render();
}

async function init() {
  await carregarBanco();

  fillFilters();
  render();

  $$(".nav-item").forEach(b => {
    b.onclick = () => {
      $$(".nav-item").forEach(x => x.classList.remove("active"));
      b.classList.add("active");

      $$(".page").forEach(p => p.classList.remove("active"));
      $("#" + b.dataset.page).classList.add("active");

      $("#pageTitle").textContent = b.textContent;

      setTimeout(() => map && map.invalidateSize(), 200);
    };
  });

  ["filtroMes", "filtroServico", "filtroTurno", "filtroRA"].forEach(id => {
    $("#" + id).onchange = () => {
      state.mes = $("#filtroMes").value;
      state.servico = $("#filtroServico").value;
      state.turno = $("#filtroTurno").value;
      state.ra = $("#filtroRA").value;
      render();
    };
  });

  $("#arquivoExcel").onchange = e => {
    if (e.target.files[0]) importar(e.target.files[0]);
  };
}

document.addEventListener("DOMContentLoaded", init);