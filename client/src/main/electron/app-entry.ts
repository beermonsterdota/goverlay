import { BrowserWindow, ipcMain } from 'electron'
import { Menu, Tray } from 'electron'
import { screen, shell } from 'electron'
import * as path from 'path'
import { loadNativeLib } from '../utils/loadoverlay'
import { fileUrl } from '../utils/utils'

enum AppWindows {
  main = 'main',
  osr = 'osr',
  osrpopup = 'osrpopup',
}

const basePath = 'http://localhost:8081/hud'

class Application {
  private windows: Map<string, Electron.BrowserWindow>
  private tray: Electron.Tray | null
  private markQuit = false

  private Overlay
  private scaleFactor = 1.0

  constructor() {
    this.windows = new Map()
    this.tray = null

    this.Overlay = loadNativeLib()
  }

  get mainWindow() {
    return this.windows.get(AppWindows.main) || null
  }

  set mainWindow(window: Electron.BrowserWindow | null) {
    if (!window) {
      this.windows.delete(AppWindows.main)
    } else {
      this.windows.set(AppWindows.main, window)
      window.on('closed', () => {
        this.mainWindow = null
      })

      window.loadURL(global.CONFIG.entryUrl)

      window.on('ready-to-show', () => {
        this.showAndFocusWindow(AppWindows.main)
      })

      window.webContents.on('did-fail-load', () => {
        window.reload()
      })

      window.on('close', (event) => {
        if (this.markQuit) {
          return
        }
        event.preventDefault()
        window.hide()
        return false
      })

      if (global.DEBUG) {
        window.webContents.openDevTools()
      }
    }
  }

  public getWindow(window: string) {
    return this.windows.get(window) || null
  }

  public createMainWindow() {
    const options: Electron.BrowserWindowConstructorOptions = {
      height: 600,
      width: 800,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    }
    const mainWindow = this.createWindow(AppWindows.main, options)
    this.mainWindow = mainWindow
    return mainWindow
  }

  public openMainWindow() {
    let mainWindow = this.mainWindow
    if (!mainWindow) {
      mainWindow = this.createMainWindow()
    }
    mainWindow!.show()
    mainWindow!.focus()
  }

  public closeMainWindow() {
    const mainWindow = this.mainWindow
    if (mainWindow) {
      mainWindow.close()
    }
  }

  public startOverlay() {
    this.Overlay!.start()
    this.Overlay!.setHotkeys([
      { name: 'app.key0', keyCode: 48, modifiers: { ctrl: false } },
      { name: 'app.key1', keyCode: 49, modifiers: { ctrl: false } },
      { name: 'app.key2', keyCode: 50, modifiers: { ctrl: false } },
      { name: 'app.key3', keyCode: 51, modifiers: { ctrl: false } },
      { name: 'app.key4', keyCode: 52, modifiers: { ctrl: false } },
      { name: 'app.key5', keyCode: 53, modifiers: { ctrl: false } },
      { name: 'app.key6', keyCode: 54, modifiers: { ctrl: false } },
      { name: 'app.key7', keyCode: 55, modifiers: { ctrl: false } },
      { name: 'app.key8', keyCode: 56, modifiers: { ctrl: false } },
      { name: 'app.key9', keyCode: 57, modifiers: { ctrl: false } },
      { name: 'overlay.toggle', keyCode: 113, modifiers: { ctrl: true } },
      { name: 'app.reload', keyCode: 116, modifiers: { ctrl: true } }, // ctrl+F5
      { name: 'app.showhide', keyCode: 125, modifiers: { ctrl: false } }, // f14
      { name: 'app.showhide1', keyCode: 96, modifiers: { ctrl: false } }, // num 0
      { name: 'app.showhide2', keyCode: 110, modifiers: { ctrl: false } }, // num .
      { name: 'app.showhide3', keyCode: 124, modifiers: { ctrl: false } }, // f13
      { name: 'app.showhide4', keyCode: 126, modifiers: { ctrl: false } }, // f15
      { name: 'app.quickStatsKDA', keyCode: 81, modifiers: { ctrl: false } }, // Q
      { name: 'app.quickStatsLH', keyCode: 87, modifiers: { ctrl: false } }, // W
      { name: 'app.quickStatsLVL', keyCode: 69, modifiers: { ctrl: false } }, // E
      { name: 'app.quickStatsXPM', keyCode: 82, modifiers: { ctrl: false } }, // R
      { name: 'app.quickStatsCurrentGold', keyCode: 84, modifiers: { ctrl: false } }, // T
      { name: 'app.quickStatsNetworth', keyCode: 89, modifiers: { ctrl: false } }, // Y
      { name: 'app.quickStatsGPM', keyCode: 85, modifiers: { ctrl: false } }, // Y
      { name: 'app.quickStatsBuyback', keyCode: 73, modifiers: { ctrl: false } }, // I
      { name: 'app.quickStatsToggle', keyCode: 68, modifiers: { ctrl: false } }, // D
      { name: 'app.customEvent', keyCode: 70, modifiers: { ctrl: false } }, // F
      { name: 'app.tab1', keyCode: 9, modifiers: { ctrl: false } }, // tab
      { name: 'app.tab2', keyCode: 9, modifiers: { ctrl: true } }, // num*
    ])

    this.Overlay!.setEventCallback((event: string, payload: any) => {
      if (event === 'game.input') {
        const window = BrowserWindow.fromId(payload.windowId)
        if (window) {
          const intpuEvent = this.Overlay!.translateInputEvent(payload)
          // if (payload.msg !== 512) {
          //   console.log(event, payload)
          //   console.log(`translate ${JSON.stringify(intpuEvent)}`)
          // }

          if (intpuEvent) {
            if ('x' in intpuEvent) intpuEvent['x'] = Math.round(intpuEvent['x'] / this.scaleFactor)
            if ('y' in intpuEvent) intpuEvent['y'] = Math.round(intpuEvent['y'] / this.scaleFactor)
            window.webContents.sendInputEvent(intpuEvent)
          }
        }
      } else if (event === 'graphics.fps') {
        const window = this.getWindow('StatusBar')
        if (window) {
          window.webContents.send('fps', payload.fps)
        }
      } else if (event === 'game.hotkey.down') {
        if (payload.name === 'app.doit') {
          this.doit()
        }
        if (payload.name === 'app.reload') {
          this.windows.forEach((window) => {
            window.webContents.reloadIgnoringCache()
            // window.reload()
          })
        }
        if (
          payload.name === 'app.showhide' ||
          payload.name === 'app.showhide1' ||
          payload.name === 'app.showhide2' ||
          payload.name === 'app.showhide3' ||
          payload.name === 'app.showhide4'
        ) {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('showhide', null)
          }
        }
        if (payload.name === 'app.quickStatsKDA') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'kda')
          }
        }
        if (payload.name === 'app.quickStatsLH') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'lh')
          }
        }
        if (payload.name === 'app.quickStatsLVL') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'lvl')
          }
        }
        if (payload.name === 'app.quickStatsXPM') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'xpm')
          }
        }
        if (payload.name === 'app.quickStatsCurrentGold') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'currentGold')
          }
        }
        if (payload.name === 'app.quickStatsNetworth') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'networth')
          }
        }
        if (payload.name === 'app.quickStatsGPM') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'gpm')
          }
        }
        if (payload.name === 'app.quickStatsBuyback') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStats', 'buyback')
          }
        }
        if (payload.name === 'app.quickStatsToggle') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('quickStatsToggle', null)
          }
        }
        if (payload.name === 'app.customEvent') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('customEvent', null)
          }
        }
        if (payload.name === 'app.tab1') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('tab1', null)
          }
        }
        if (payload.name === 'app.tab2') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('tab2', null)
          }
        }
        if (payload.name === 'app.pickban') {
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('pickban', null)
          }
        }
        console.log('!!', payload.name)
        if (payload.name.indexOf('app.key') !== -1) {
          console.log('!!!!', payload.name)
          const window = this.getWindow('OverlayTip')
          if (window) {
            window.webContents.send('key', payload.name)
          }
        }
      } else if (event === 'game.window.focused') {
        console.log('focusWindowId', payload.focusWindowId)

        BrowserWindow.getAllWindows().forEach((window) => {
          window.blurWebView()
        })

        const focusWin = BrowserWindow.fromId(payload.focusWindowId)
        if (focusWin) {
          focusWin.focusOnWebView()
        }
      }
    })
  }

  public addOverlayWindow(
    name: string,
    window: Electron.BrowserWindow,
    dragborder: number = 0,
    captionHeight: number = 0,
    transparent: boolean = false
  ) {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

    this.Overlay!.addWindow(window.id, {
      name,
      transparent,
      resizable: window.isResizable(),
      maxWidth: window.isResizable ? display.bounds.width : window.getBounds().width,
      maxHeight: window.isResizable ? display.bounds.height : window.getBounds().height,
      minWidth: window.isResizable ? 100 : window.getBounds().width,
      minHeight: window.isResizable ? 100 : window.getBounds().height,
      nativeHandle: window.getNativeWindowHandle().readUInt32LE(0),
      rect: {
        x: window.getBounds().x,
        y: window.getBounds().y,
        width: Math.floor(window.getBounds().width * this.scaleFactor),
        height: Math.floor(window.getBounds().height * this.scaleFactor),
      },
      caption: {
        left: dragborder,
        right: dragborder,
        top: dragborder,
        height: captionHeight,
      },
      dragBorderWidth: dragborder,
    })

    window.webContents.on('paint', (event, dirty, image: Electron.NativeImage) => {
      if (this.markQuit) {
        return
      }
      this.Overlay!.sendFrameBuffer(
        window.id,
        image.getBitmap(),
        image.getSize().width,
        image.getSize().height
      )
    })

    window.on('ready-to-show', () => {
      window.focusOnWebView()
    })

    window.on('resize', () => {
      console.log(`${name} resizing`)
      this.Overlay!.sendWindowBounds(window.id, {
        rect: {
          x: window.getBounds().x,
          y: window.getBounds().y,
          width: Math.floor(window.getBounds().width * this.scaleFactor),
          height: Math.floor(window.getBounds().height * this.scaleFactor),
        },
      })
    })

    // window.on("move", () => {
    //   this.Overlay!.sendWindowBounds(window.id, {
    //     rect: {
    //       x: window.getBounds().x,
    //       y: window.getBounds().y,
    //       width: Math.floor(window.getBounds().width * this.scaleFactor),
    //       height: Math.floor(window.getBounds().height * this.scaleFactor),
    //     },
    //   });
    // });

    const windowId = window.id
    window.on('closed', () => {
      this.Overlay!.closeWindow(windowId)
    })

    window.webContents.on('cursor-changed', (event, type) => {
      let cursor
      switch (type) {
        case 'default':
          cursor = 'IDC_ARROW'
          break
        case 'pointer':
          cursor = 'IDC_HAND'
          break
        case 'crosshair':
          cursor = 'IDC_CROSS'
          break
        case 'text':
          cursor = 'IDC_IBEAM'
          break
        case 'wait':
          cursor = 'IDC_WAIT'
          break
        case 'help':
          cursor = 'IDC_HELP'
          break
        case 'move':
          cursor = 'IDC_SIZEALL'
          break
        case 'nwse-resize':
          cursor = 'IDC_SIZENWSE'
          break
        case 'nesw-resize':
          cursor = 'IDC_SIZENESW'
          break
        case 'ns-resize':
          cursor = 'IDC_SIZENS'
          break
        case 'ew-resize':
          cursor = 'IDC_SIZEWE'
          break
        case 'none':
          cursor = ''
          break
      }
      if (cursor) {
        this.Overlay!.sendCommand({ command: 'cursor', cursor })
      }
    })
  }

  public createOsrWindow() {
    const options: Electron.BrowserWindowConstructorOptions = {
      x: 1,
      y: 1,
      height: 360,
      width: 640,
      frame: false,
      show: false,
      transparent: true,
      webPreferences: {
        offscreen: true,
      },
    }

    const window = this.createWindow(AppWindows.osr, options)

    // window.webContents.openDevTools({
    //   mode: "detach"
    // })
    window.loadURL(fileUrl(path.join(global.CONFIG.distDir, 'index/osr.html')))

    window.webContents.on('paint', (event, dirty, image: Electron.NativeImage) => {
      if (this.markQuit) {
        return
      }
      this.mainWindow!.webContents.send('osrImage', {
        image: image.toDataURL(),
      })
    })

    this.addOverlayWindow('MainOverlay', window, 10, 40)
    return window
  }

  public createTestWindow() {
    const options: Electron.BrowserWindowConstructorOptions = {
      // width: 2560,
      // height: 1440,
      width: 1920,
      height: 1080,
      frame: false,
      show: false,
      transparent: true,
      resizable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        zoomFactor: 1,
        // zoomFactor: 4 / 3,
        offscreen: true,
        backgroundThrottling: false,
        nodeIntegration: true,
        contextIsolation: false,
      },
    }

    const name = 'OverlayTip'
    const window = this.createWindow(name, options)

    window.setPosition(0, 0)
    // window.webContents.openDevTools({
    //   mode: 'detach',
    // })
    window.loadURL(basePath)

    window.once('ready-to-show', () => {
      window.webContents.setZoomFactor(1.0)
      window.setSize(1920, 1080)
      // window.webContents.setZoomFactor(4 / 3)
      // window.setSize(2560, 1440)
    })

    this.addOverlayWindow(name, window, 0, 0)
    return window
  }

  public createOsrStatusbarWindow() {
    const options: Electron.BrowserWindowConstructorOptions = {
      x: 100,
      y: 0,
      height: 50,
      width: 200,
      frame: false,
      show: false,
      transparent: true,
      resizable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        offscreen: true,
      },
    }

    const name = 'StatusBar'
    const window = this.createWindow(name, options)

    // window.webContents.openDevTools({
    //   mode: "detach"
    // })
    window.loadURL(fileUrl(path.join(global.CONFIG.distDir, 'index/statusbar.html')))

    this.addOverlayWindow(name, window, 0, 0)
    return window
  }

  public createOsrTipWindow() {
    const options: Electron.BrowserWindowConstructorOptions = {
      x: 0,
      y: 0,
      height: 220,
      width: 320,
      resizable: false,
      frame: false,
      show: false,
      transparent: true,
      webPreferences: {
        offscreen: true,
      },
    }

    const getRandomInt = (min: number, max: number) => {
      return Math.floor(Math.random() * (max - min + 1)) + min
    }
    const name = `osrtip ${getRandomInt(1, 10000)}`
    const window = this.createWindow(name, options)

    // window.webContents.openDevTools({
    //   mode: "detach"
    // })
    window.loadURL(fileUrl(path.join(global.CONFIG.distDir, 'index/osrtip.html')))

    this.addOverlayWindow(name, window, 30, 40, true)
    return window
  }

  public closeAllWindows() {
    const windows = this.windows.values()
    for (const window of windows) {
      window.close()
    }
  }

  public closeWindow(name: string) {
    const window = this.windows.get(name)
    if (window) {
      window.close()
    }
  }

  public hideWindow(name: string) {
    const window = this.windows.get(name)
    if (window) {
      window.hide()
    }
  }

  public showAndFocusWindow(name: string) {
    const window = this.windows.get(name)
    if (window) {
      window.show()
      window.focus()
    }
  }

  public setupSystemTray() {
    if (!this.tray) {
      this.tray = new Tray(path.join(global.CONFIG.distDir, 'assets/icon-16.png'))
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'OpenMainWindow',
          click: () => {
            this.showAndFocusWindow(AppWindows.main)
          },
        },
        {
          label: 'Quit',
          click: () => {
            this.quit()
          },
        },
      ])
      this.tray.setToolTip('WelCome')
      this.tray.setContextMenu(contextMenu)

      this.tray.on('click', () => {
        this.showAndFocusWindow(AppWindows.main)
      })
    }
  }

  public start() {
    this.createMainWindow()

    this.setupSystemTray()
    this.setupIpc()
  }

  public activate() {
    this.openMainWindow()
  }

  public quit() {
    this.markQuit = true
    this.closeMainWindow()
    this.closeAllWindows()
    if (this.tray) {
      this.tray.destroy()
    }

    if (this.Overlay) {
      this.Overlay.stop()
    }
  }

  public openLink(url: string) {
    shell.openExternal(url)
  }

  private createWindow(name: string, option: Electron.BrowserWindowConstructorOptions) {
    const window = new BrowserWindow(option)
    this.windows.set(name, window)
    window.on('closed', () => {
      this.windows.delete(name)
    })
    // window.webContents.on('new-window', (e, url) => {
    //   e.preventDefault()
    //   shell.openExternal(url)
    // })

    if (global.DEBUG) {
      window.webContents.on(
        'before-input-event',
        (event: Electron.Event, input: Electron.Input) => {
          if (input.key === 'F12' && input.type === 'keyDown') {
            window.webContents.openDevTools()
          }
        }
      )
    }

    return window
  }

  private setupIpc() {
    ipcMain.once('start', () => {
      this.scaleFactor = screen.getDisplayNearestPoint({
        x: 0,
        y: 0,
      }).scaleFactor

      console.log(`starting overlay...`)
      this.startOverlay()

      this.createTestWindow()
      // this.createOsrWindow();
      // this.createOsrStatusbarWindow();
    })

    ipcMain.on('inject', (event, arg) => {
      console.log(`--------------------\n try inject ${arg}`)
      for (const window of this.Overlay.getTopWindows()) {
        if (window.title.indexOf(arg) !== -1) {
          console.log(`--------------------\n injecting ${JSON.stringify(window)}`)
          this.Overlay.injectProcess(window)
        }
      }
    })

    ipcMain.on('osrClick', () => {
      this.createOsrTipWindow()
    })

    ipcMain.on('doit', () => {
      this.doit()
    })

    ipcMain.on('startIntercept', () => {
      this.Overlay!.sendCommand({
        command: 'input.intercept',
        intercept: true,
      })
    })

    ipcMain.on('stopIntercept', () => {
      this.Overlay!.sendCommand({
        command: 'input.intercept',
        intercept: false,
      })
    })
  }

  private doit() {
    const name = 'OverlayTip'
    this.closeWindow(name)

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

    const window = this.createWindow(name, {
      width: 480,
      height: 270,
      frame: false,
      show: false,
      transparent: true,
      resizable: false,
      x: 0,
      y: 0,
      webPreferences: {
        offscreen: true,
        nodeIntegration: true,
      },
    })

    this.addOverlayWindow(name, window, 0, 0)

    // window.webContents.openDevTools({mode: "detach"})

    window.loadURL(fileUrl(path.join(global.CONFIG.distDir, 'doit/index.html')))
  }
}

export { Application }
