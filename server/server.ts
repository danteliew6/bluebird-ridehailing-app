import { createApp, analytics, genie, server, serving } from '@databricks/appkit';

createApp({
  plugins: [
    analytics(),
    genie(),
    server(),
    serving(),
  ],
}).catch(console.error);
