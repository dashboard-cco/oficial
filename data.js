const SERVICOS = {
  'P1':'Coleta Orgânica','P2.1':'Coleta Seletiva','P2.2':'Rejeito Seletivo das IRR','P3':'Remoção Manual','P4':'Remoção Mecanizada','P5':'Varrição Manual','P6':'Varrição Mecanizada','P7':'Lavagem de Vias','P8':'Limpeza de Equipamentos','P9':'Catação em Área Verde','P10':'Pintura Mecanizada','P11':'Limpeza Pós-Eventos','P12':'Transbordo'
};
const VALORES_FIXOS = {'P1':296,'P2.1':1027.42,'P2.2':1027.42,'P3':41992.93,'P4':68.80,'P5':160.94,'P6':76.24,'P7':49811.72,'P8':81001.04,'P9':122039.23,'P10':346660.01,'P11':272459.08,'P12':0.83};
const RA_COORDS = {
  'Plano Piloto':[-15.793889,-47.882778],'São Sebastião':[-15.9067,-47.7739],'Paranoá':[-15.7750,-47.7800],'Itapoã':[-15.7481,-47.7556],'Planaltina':[-15.6178,-47.6488],'Sobradinho':[-15.6500,-47.7928],'Cruzeiro':[-15.7894,-47.9378],'Lago Norte':[-15.7389,-47.8465],'Núcleo Bandeirante':[-15.8713,-47.9677],'Candangolândia':[-15.8527,-47.9505],'Sudoeste/Octogonal':[-15.7993,-47.9253],'Park Way':[-15.9185,-47.9608],'Jardim Botânico':[-15.8710,-47.8010],'SCIA/Estrutural':[-15.7807,-47.9972],'Varjão':[-15.7106,-47.8769],'Fercal':[-15.6000,-47.8667]};
const DEMO = {
  painel:[
    ['P1','Coleta Orgânica',21196.85,'T/mês',19590.46,1.082,24,24],['P2.1','Coleta Seletiva',773,'Vg/mês',720,1.074,24,24],['P2.2','Rejeito Seletivo Das Irr',232,'Vg/mês',240,.967,24,24],['P3','Remoção Manual',12,'Equipe',12,1,24,24],['P4','Remoção Mecanizada',1330,'m³',1280,1.039,24,24],['P5','Varrição Manual',24560,'Km',24120,1.018,24,24],['P6','Varrição Mecanizada',3400,'Km',3500,.971,24,24],['P9','Catação Área Verde',11,'Equipe',11,1,24,24]
  ].map(r=>({servico:r[0],nome:r[1],acumulado:r[2],medicao:r[3],previsto:r[4],percentual:r[5],dias:r[6],totalDias:r[7],valor:(VALORES_FIXOS[r[0]]||0)*r[2]})),
  operacoes:[]
};
['Plano Piloto','São Sebastião','Paranoá','Itapoã','Planaltina'].forEach((ra,i)=>{
  Object.keys(SERVICOS).slice(0,8).forEach((p,j)=>DEMO.operacoes.push({servico:p,data:`2026-06-${String((i+j)%26+1).padStart(2,'0')}`,ra,turno:(i+j)%2?'Noturno':'Diurno',veiculo:`ASA${60+i+j}`,circuito:100000+i*10+j,km_total:20+i+j,viagens:1+(j%4),peso_t:10+i*2,velocidade_media:18+j,qtd_equipe:1}));
});
