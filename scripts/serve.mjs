import { createEditorServer } from './static-server.mjs';
createEditorServer().listen(8765, '127.0.0.1', () => console.log('Open http://localhost:8765'));
