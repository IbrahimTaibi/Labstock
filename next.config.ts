import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /* Factures fournisseurs importées (PDF/JPG/PNG, 10 Mo max) : marge pour
       l'enveloppe multipart. */
    serverActions: {
      bodySizeLimit: "12mb",
    },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
