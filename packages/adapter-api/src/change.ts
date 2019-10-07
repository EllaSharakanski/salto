import {
  AdditionDiff, ModificationDiff, RemovalDiff,
} from '@salto/dag'
import {
  ObjectType, InstanceElement, Field, PrimitiveType,
} from './elements'

export type ChangeDataType = ObjectType | InstanceElement | Field | PrimitiveType
export type Change<T = ChangeDataType> =
  AdditionDiff<T> | ModificationDiff<T> | RemovalDiff<T>
export const getChangeElement = <T>(change: Change<T>): T =>
  (change.action === 'remove' ? change.data.before : change.data.after)