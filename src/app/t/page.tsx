import { connection } from "next/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function TableIndexPage() {
  await connection();
  redirect("/order");
}

