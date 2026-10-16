// RASCUNHO para revisão: valores aproximados e médios, de referência geral.
// Cada bebé é diferente — confirmar sempre com a equipa de saúde.
export interface WeekInfo {
  week: number
  fruit: string
  emoji: string
  cm: number | null
  grams: number | null
  text: string
}

const rows: [string, string, number | null, number | null, string][] = [
  ['semente de papoila', '🌱', null, null, 'A gravidez conta-se desde o 1.º dia da última menstruação. Nesta semana ainda não houve fecundação.'],
  ['semente de papoila', '🌱', null, null, 'O corpo prepara a ovulação. A fecundação acontece por volta do fim desta semana.'],
  ['semente de papoila', '🌱', null, null, 'O óvulo fecundado começa a dividir-se e desloca-se para o útero.'],
  ['semente de papoila', '🌱', 0.1, null, 'O embrião implanta-se no útero. A placenta começa a formar-se.'],
  ['semente de sésamo', '🌱', 0.2, null, 'Começa a formar-se o tubo neural, que dará origem ao cérebro e à medula. O coração começa a bater.'],
  ['lentilha', '🫘', 0.6, null, 'Formam-se os esboços dos braços e das pernas. O coração bate de forma regular.'],
  ['mirtilo', '🫐', 1.0, null, 'O cérebro desenvolve-se depressa. Formam-se os olhos e o nariz.'],
  ['framboesa', '🍇', 1.6, 1, 'Os dedos começam a separar-se. Todos os órgãos principais já se começaram a formar.'],
  ['azeitona', '🫒', 2.3, 2, 'Fim do período embrionário. A cauda embrionária desaparece e o bebé começa a mexer-se.'],
  ['tâmara', '🌴', 3.1, 4, 'Passa a chamar-se feto. As pálpebras e as orelhas estão a formar-se.'],
  ['figo', '🟣', 4.1, 7, 'Os dedos já estão separados e começam a formar-se as unhas.'],
  ['lima', '🍋', 5.4, 14, 'Os reflexos desenvolvem-se: o bebé pode fechar a mão. Termina o período de maior risco do 1.º trimestre.'],
  ['vagem', '🫛', 7.4, 23, 'Início do 2.º trimestre. Formam-se as cordas vocais e as impressões digitais.'],
  ['limão', '🍋', 8.7, 43, 'O pescoço define-se e o bebé faz caretas. A cabeça fica mais proporcionada com o corpo.'],
  ['maçã', '🍎', 10.1, 70, 'O esqueleto continua a endurecer. O bebé pode já reagir à luz através da barriga.'],
  ['abacate', '🥑', 11.6, 100, 'Os músculos do rosto ganham força. Algumas mães começam a sentir os primeiros movimentos.'],
  ['pera', '🍐', 13.0, 140, 'A gordura começa a acumular-se sob a pele. O sistema nervoso amadurece.'],
  ['batata-doce', '🍠', 14.2, 190, 'Os ouvidos estão formados e o bebé pode começar a ouvir sons.'],
  ['manga', '🥭', 15.3, 240, 'A pele é coberta por uma camada protetora, o vérnix. Os movimentos são cada vez mais coordenados.'],
  ['banana', '🍌', 25.6, 300, 'Meio da gravidez. Habitualmente faz-se a ecografia morfológica entre as semanas 18 e 22. A partir daqui mede-se da cabeça aos pés.'],
  ['cenoura', '🥕', 26.7, 360, 'O bebé engole líquido amniótico e o sistema digestivo desenvolve-se.'],
  ['papaia', '🥭', 27.8, 430, 'Os sentidos do tacto e da audição aperfeiçoam-se. O bebé responde a sons mais fortes.'],
  ['toranja', '🍊', 28.9, 500, 'Os pulmões desenvolvem-se. Os movimentos já são sentidos de forma mais regular.'],
  ['espiga de milho', '🌽', 30.0, 600, 'A cara está praticamente formada. É habitual fazer a prova de tolerância à glicose nesta fase.'],
  ['nabo', '🥬', 34.6, 660, 'A pele ganha forma à medida que o bebé acumula gordura. O cabelo pode começar a ser visível.'],
  ['alface', '🥬', 35.6, 760, 'Os olhos começam a abrir-se. O bebé alterna períodos de sono e de atividade.'],
  ['couve-flor', '🥦', 36.6, 875, 'O cérebro desenvolve-se rapidamente. O bebé reage a luz, sons e toque.'],
  ['beringela', '🍆', 37.6, 1000, 'Início do 3.º trimestre. Os pulmões continuam a amadurecer. Pode começar a contar os movimentos do bebé.'],
  ['abóbora', '🎃', 38.6, 1150, 'Os ossos estão totalmente formados mas ainda moles. O bebé ganha peso depressa.'],
  ['repolho', '🥬', 39.9, 1320, 'O bebé move-se menos por haver menos espaço, mas deve continuar a mexer-se todos os dias.'],
  ['coco', '🥥', 41.1, 1500, 'As pupilas já reagem à luz. O bebé costuma começar a virar-se para a posição de cabeça para baixo.'],
  ['abóbora-menina', '🎃', 42.4, 1700, 'As unhas chegam às pontas dos dedos. Continua a acumular-se gordura.'],
  ['ananás', '🍍', 43.7, 1900, 'O sistema imunitário desenvolve-se. O crânio permanece flexível para o parto.'],
  ['melão', '🍈', 45.0, 2100, 'Os pulmões estão quase maduros. O bebé ocupa cada vez mais espaço no útero.'],
  ['melão-de-mel', '🍈', 46.2, 2400, 'Os rins estão totalmente desenvolvidos e o fígado já processa alguns resíduos.'],
  ['alface-romana', '🥬', 47.4, 2600, 'Pode fazer-se o rastreio de estreptococo B por volta das semanas 35-37. O bebé pode encaixar na bacia.'],
  ['acelga', '🥬', 48.6, 2900, 'A partir daqui o bebé é considerado de termo precoce. Treina a sucção e a respiração.'],
  ['alho-francês', '🌿', 49.8, 3100, 'O bebé está pronto para nascer a qualquer momento. Fica atenta aos sinais de trabalho de parto.'],
  ['melancia pequena', '🍉', 50.7, 3300, 'O cérebro e os pulmões continuam a amadurecer. Os movimentos podem ser menos amplos mas devem manter-se.'],
  ['abóbora', '🎃', 51.2, 3500, 'Data provável do parto. Só uma minoria dos bebés nasce exatamente nesta data.'],
]

export const WEEKS: WeekInfo[] = rows.map(([fruit, emoji, cm, grams, text], i) => ({
  week: i + 1,
  fruit,
  emoji,
  cm,
  grams,
  text,
}))

export function weekInfo(week: number): WeekInfo {
  return WEEKS[Math.min(Math.max(week, 1), 40) - 1]
}

// RASCUNHO para revisão: sintomas frequentes por fase, de referência geral. Nem todas sentem estes, e
// a ausência deles não é sinal de problema.
const COMMON: [from: number, to: number, list: string[]][] = [
  [4, 5, ['Seios sensíveis', 'Cansaço', 'Urinar mais vezes']],
  [6, 13, ['Enjoo', 'Cansaço', 'Seios sensíveis', 'Aversão a cheiros']],
  [14, 20, ['Mais energia', 'Nariz entupido', 'Dores nos ligamentos da barriga']],
  [21, 27, ['Azia', 'Dor de costas', 'Cãibras nas pernas']],
  [28, 36, ['Azia', 'Falta de ar', 'Pés inchados', 'Contrações de treino', 'Dormir pior']],
  [37, 42, ['Pressão na bacia', 'Contrações de treino', 'Dormir pior', 'Cansaço']],
]

export function commonSymptoms(week: number): string[] {
  return COMMON.find(([a, b]) => week >= a && week <= b)?.[2] ?? []
}
