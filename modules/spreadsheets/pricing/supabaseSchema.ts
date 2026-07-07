/**
 * Minimal Supabase schema typing for the pricing_* tables only — this module
 * does not import `@/types/database` (the main app's schema) to stay fully
 * independent.
 */
export interface PricingDatabase {
  public: {
    Tables: {
      pricing_insumos: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          unidade_medida: "g" | "kg" | "ml" | "L" | "un";
          preco_compra: number;
          quantidade_compra: number;
          peso_bruto: number | null;
          peso_liquido: number | null;
          fornecedor: string | null;
          categoria: string | null;
          observacao: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<PricingDatabase["public"]["Tables"]["pricing_insumos"]["Row"], "id" | "user_id" | "created_at" | "updated_at"> & {
          id?: string;
          user_id?: string;
        };
        Update: Partial<PricingDatabase["public"]["Tables"]["pricing_insumos"]["Insert"]>;
      };
      pricing_produtos: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          categoria: string | null;
          rendimento_porcoes: number;
          despesas_variaveis_pct: number;
          despesas_fixas_pct: number;
          impostos_pct: number;
          margem_desejada_pct: number;
          preco_praticado: number | null;
          observacao: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<PricingDatabase["public"]["Tables"]["pricing_produtos"]["Row"], "id" | "user_id" | "created_at" | "updated_at"> & {
          id?: string;
          user_id?: string;
        };
        Update: Partial<PricingDatabase["public"]["Tables"]["pricing_produtos"]["Insert"]>;
      };
      pricing_produto_insumos: {
        Row: {
          id: string;
          user_id: string;
          produto_id: string;
          insumo_id: string;
          quantidade_usada: number;
          created_at: string;
        };
        Insert: Omit<PricingDatabase["public"]["Tables"]["pricing_produto_insumos"]["Row"], "id" | "user_id" | "created_at"> & {
          id?: string;
          user_id?: string;
        };
        Update: Partial<PricingDatabase["public"]["Tables"]["pricing_produto_insumos"]["Insert"]>;
      };
      pricing_configuracoes: {
        Row: {
          user_id: string;
          impostos_pct_padrao: number;
          despesas_fixas_pct_padrao: number;
          despesas_variaveis_pct_padrao: number;
          margem_desejada_pct_padrao: number;
          regime_tributario: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei" | "outro" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<PricingDatabase["public"]["Tables"]["pricing_configuracoes"]["Row"], "user_id" | "created_at" | "updated_at"> & {
          user_id: string;
        };
        Update: Partial<PricingDatabase["public"]["Tables"]["pricing_configuracoes"]["Insert"]>;
      };
    };
  };
}
