import { app as ElectronApp, session } from 'electron'

import './utils/config'

import { Application } from './electron/app-entry'

const appEntry = new Application()

ElectronApp.disableHardwareAcceleration()

ElectronApp.on('ready', () => {
  session.defaultSession.clearCache().then(() => {
    appEntry.start()
  })
})

ElectronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ElectronApp.quit()
  }
})

ElectronApp.on('activate', () => {
  appEntry.activate()
})
