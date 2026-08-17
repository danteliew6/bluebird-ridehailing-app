import { analytics, createApp, genie, server, serving } from "@databricks/appkit";

//#region server/server.ts
createApp({ plugins: [
	analytics(),
	genie(),
	server(),
	serving()
] }).catch(console.error);

//#endregion
export {  };