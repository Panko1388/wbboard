export default {
  reactStrictMode: true,
  output: "standalone",
  // стабильная сборка на малых VPS (2 vCPU / 4 GB)
  experimental: { workerThreads: false, cpus: 1 },
};
