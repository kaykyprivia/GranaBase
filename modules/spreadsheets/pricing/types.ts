export type UnidadeMedida = "g" | "kg" | "ml" | "L" | "un";

export type RegimeTributario =
  | "simples_nacional"
  | "lucro_presumido"
  | "lucro_real"
  | "mei"
  | "outro";

export interface Insumo {
  id: string;
  userId: string;
  nome: string;
  unidadeMedida: UnidadeMedida;
  precoCompra: number;
  quantidadeCompra: number;
  pesoBruto: number | null;
  pesoLiquido: number | null;
  fornecedor: string | null;
  categoria: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InsumoInput = Omit<Insumo, "id" | "userId" | "createdAt" | "updatedAt">;

export interface ProdutoInsumo {
  id: string;
  produtoId: string;
  insumoId: string;
  quantidadeUsada: number;
}

export interface Produto {
  id: string;
  userId: string;
  nome: string;
  categoria: string | null;
  rendimentoPorcoes: number;
  despesasVariaveisPct: number;
  despesasFixasPct: number;
  impostosPct: number;
  margemDesejadaPct: number;
  precoPraticado: number | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
  fichaTecnica: ProdutoInsumo[];
}

export type ProdutoInput = Omit<
  Produto,
  "id" | "userId" | "createdAt" | "updatedAt" | "fichaTecnica"
>;

export interface Configuracoes {
  userId: string;
  impostosPctPadrao: number;
  despesasFixasPctPadrao: number;
  despesasVariaveisPctPadrao: number;
  margemDesejadaPctPadrao: number;
  regimeTributario: RegimeTributario | null;
}

export type ConfiguracoesInput = Omit<Configuracoes, "userId">;
