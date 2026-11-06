import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WDYT — What do you think?",
  description: "질문과 생각을 나누며 나를 알아가는 공간",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
