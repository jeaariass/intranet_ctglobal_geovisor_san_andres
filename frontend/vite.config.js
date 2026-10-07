// frontend/vite.config.js
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE || '/SAN_ANDRES/',

    build: {
      rollupOptions: {
        input: {
          main:       resolve(__dirname, 'index.html'),
          login:      resolve(__dirname, 'login.html'),
          adminUsers: resolve(__dirname, 'admin-users.html'),
        },
      },
    },

    server: {
      port: 5176,
      strictPort: false,

      proxy: {
        '/gv-san-andres-docs': {
          target: 'http://localhost:4006',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/gv-san-andres-docs/, ''),
        },
        '/api/gv/san-andres': {
          target: 'http://localhost:4006',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/gv\/san-andres/, '/api'),
        },
        '/api/intranet': {
          // Proxy server-to-server (sin CORS) hacia la intranet real.
          target: 'https://intranet.ctglobal.com.co',
          changeOrigin: true,
          secure: true,
          rewrite: path => path.replace(/^\/api\/intranet/, ''),
        },
        '/geoserver': {
          target: 'http://200.7.107.14:8080',
          changeOrigin: true,
        },
      },
    },
  };
});