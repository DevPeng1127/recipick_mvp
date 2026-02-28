export type StorageType = 'ROOM' | 'FRIDGE' | 'FREEZER'

export interface StorageBox {
  id: number
  refrigerator_id: number
  name: string
  type: StorageType
}

export interface StorageBoxCreate {
  name: string
  type: StorageType
}

export interface StorageBoxUpdate {
  name?: string
  type?: StorageType
}
