import { toast } from "sonner";

interface RunMutationOptions {
  successMessage?: string;
  errorMessage?: string;
}

/**
 * Wraps a hook mutation so failures are always visible to the user instead
 * of disappearing as an unhandled promise rejection. Every create/update/
 * delete call in the pricing module should go through this.
 */
export async function runMutation<T>(
  promise: Promise<T>,
  options: RunMutationOptions = {}
): Promise<T | undefined> {
  try {
    const result = await promise;
    if (options.successMessage) toast.success(options.successMessage);
    return result;
  } catch (error) {
    toast.error(options.errorMessage ?? describeError(error));
    return undefined;
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("Usuario nao autenticado")) {
    return "Sua sessão expirou — atualize a página e entre novamente.";
  }
  if (/check constraint|violates/i.test(message)) {
    return "Valor inválido — confira os números informados.";
  }
  if (/unique/i.test(message)) {
    return "Esse item já existe.";
  }
  return "Não foi possível salvar. Tente novamente.";
}
