export type ListKey = 'mala' | 'compras' | 'tarefas'

export const LISTS: Record<ListKey, { label: string; suggestions: string[] }> = {
  mala: {
    label: 'Mala da maternidade',
    suggestions: [
      'Documentos (cartão de cidadão, boletim de grávida, exames)',
      'Plano de parto',
      'Camisas de dormir abertas à frente',
      'Chinelos e meias',
      'Artigos de higiene pessoal',
      'Soutiens de amamentação e discos',
      'Roupa interior descartável',
      'Carregador do telemóvel',
      'Body, babygrow e gorro (bebé)',
      'Fraldas recém-nascido',
      'Manta e roupa para a saída',
      'Cadeirinha para o carro',
      'Snacks e água (acompanhante)',
    ],
  },
  compras: {
    label: 'Compras do bebé',
    suggestions: [
      'Berço ou moisés',
      'Colchão',
      'Cadeirinha auto',
      'Carrinho',
      'Bodies e babygrows',
      'Fraldas',
      'Toalhitas',
      'Banheira',
      'Termómetro',
      'Biberões e esterilizador',
      'Monitor de bebé',
      'Mantas e lençóis',
    ],
  },
  tarefas: {
    label: 'Tarefas',
    suggestions: [
      'Escolher maternidade',
      'Marcar curso de preparação para o parto',
      'Preparar o quarto do bebé',
      'Instalar a cadeirinha no carro',
      'Fazer a mala da maternidade',
      'Combinar quem fica com o bebé na licença',
      'Escolher pediatra',
    ],
  },
}
