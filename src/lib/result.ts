export function mutationResult(error: unknown): {
  success: boolean;
  message: string;
} {
  if (error instanceof Error) {
    return { success: false, message: error.message };
  }
  return { success: false, message: "Something went wrong" };
}
