"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AdditionalForm } from "@/components/admin/additional-form";
import type { Additional } from "@/types/database";
import { formatCurrency } from "@/lib/utils";

export default function AdminAdicionaisPage() {
  const [additionals, setAdditionals] = useState<Additional[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("additionals")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Não foi possível carregar os adicionais.");
    } else {
      setAdditionals(data as Additional[]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(item: Additional) {
    const supabase = createClient();
    const { error } = await supabase
      .from("additionals")
      .update({ active: !item.active })
      .eq("id", item.id);

    if (error) {
      toast.error("Não foi possível atualizar.");
      return;
    }
    load();
  }

  async function deleteAdditional(item: Additional) {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("additionals").delete().eq("id", item.id);

    if (error) {
      toast.error("Não foi possível excluir.");
      return;
    }
    toast.success("Adicional excluído.");
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-acai-700">Adicionais</h1>

      <AdditionalForm onCreated={load} />

      {isLoading ? (
        <p className="text-acai-500">Carregando...</p>
      ) : additionals.length === 0 ? (
        <p className="text-acai-500">Nenhum adicional cadastrado ainda.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-acai-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-acai-50 text-acai-600">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Preço</th>
                <th className="px-4 py-3 font-medium">Estoque</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {additionals.map((item) => (
                <tr key={item.id} className="border-t border-acai-100">
                  <td className="px-4 py-3 font-medium text-acai-900">{item.name}</td>
                  <td className="px-4 py-3 text-acai-600">{formatCurrency(item.price)}</td>
                  <td className="px-4 py-3 text-acai-600">
                    {item.stock_quantity ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        item.active
                          ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700"
                          : "rounded-full bg-acai-100 px-2 py-1 text-xs font-medium text-acai-600"
                      }
                    >
                      {item.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => toggleActive(item)}
                        className="text-xs font-medium text-acai-600 hover:underline"
                      >
                        {item.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => deleteAdditional(item)}
                        className="text-xs font-medium text-red-500 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
