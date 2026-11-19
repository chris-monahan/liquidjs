import { ForloopDrop } from './forloop-drop'

export class TablerowloopDrop extends ForloopDrop {
  private cols: number
  private rowVal = 1
  private colVal = 1
  public constructor (length: number, cols: number, collection: string, variable: string) {
    super(length, collection, variable)
    this.length = length
    this.cols = cols
  }
  public next () {
    this.i++
    if (this.colVal === this.cols) {
      this.colVal = 1
      this.rowVal++
    } else {
      this.colVal++
    }
  }
  public row () {
    return this.rowVal
  }
  public col0 () {
    return this.colVal - 1
  }
  public col () {
    return this.colVal
  }
  public col_first () {  // eslint-disable-line
    return this.colVal === 1
  }
  public col_last () { // eslint-disable-line
    return this.colVal === this.cols
  }
}
