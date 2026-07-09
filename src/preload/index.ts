import { contextBridge } from 'electron'

const api = {}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
