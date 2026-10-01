import { ConvexError } from "convex/values";

export function mutationResult(error: unknown): {
  success: boolean;
  message: string;
} {
  if (error instanceof ConvexError && typeof error.data === "string") {
    const message = error.data.trim();
    if (message) {
      return { success: false, message };
    }
  }
  if (error instanceof Error) {
    return { success: false, message: error.message };
  }
  return { success: false, message: "Something went wrong" };
}
