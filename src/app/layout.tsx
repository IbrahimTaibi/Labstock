import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LABSTOCK — Gestion des stocks de laboratoire",
  description:
    "Suivi en temps réel du stock de laboratoire, des lots FEFO et des factures fournisseurs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* suppressHydrationWarning : le script inline corrige data-theme avant
     l'hydratation, l'attribut diffère donc forcément du rendu serveur. La
     consigne ne vaut que pour <html> lui-même, pas pour l'arbre en dessous. */
  return (
    <html
      lang="fr"
      className="h-full antialiased"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        {/* Applique le thème mémorisé avant le premier rendu (évite le flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem("labstock-theme")||"light"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
