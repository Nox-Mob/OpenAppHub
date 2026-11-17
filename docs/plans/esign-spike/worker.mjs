import { sealDemo } from "./seal.mjs";
export default {
  async fetch() {
    try {
      return Response.json(await sealDemo());
    } catch (e) {
      return new Response(String(e?.stack || e), { status: 500 });
    }
  },
};
