const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ytmDesktop', {
  platform: process.platform,
  isDesktop: true,
});
