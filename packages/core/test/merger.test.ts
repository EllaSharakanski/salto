/*
*                      Copyright 2020 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import {
  ObjectType, ElemID, Field, BuiltinTypes, InstanceElement, PrimitiveType,
  PrimitiveTypes, TypeElement, CORE_ANNOTATIONS, ListType, Variable,
} from '@salto-io/adapter-api'
import {
  mergeElements,
  MultipleBaseDefinitionsMergeError,
  NoBaseDefinitionMergeError, DuplicateAnnotationTypeError, DuplicateVariableNameError,
  DuplicateAnnotationError, DuplicateAnnotationFieldDefinitionError, DuplicateInstanceKeyError,
  MultiplePrimitiveTypesUnsupportedError, createDefaultInstanceFromType,
} from '../src/core/merger'
import { Keywords } from '../src/parser/language'

describe('merger', () => {
  const updateType = new ObjectType(
    { elemID: new ElemID('', Keywords.UPDATE_DEFINITION) }
  )
  const baseElemID = new ElemID('salto', 'base')
  const base = new ObjectType({
    elemID: baseElemID,
    fields: {
      field1: new Field(baseElemID, 'field1', BuiltinTypes.STRING, { label: 'base' }),
      field2: new Field(baseElemID, 'field2', BuiltinTypes.STRING, { label: 'base' }),
    },
    annotations: {
      _default: {
        field1: 'base1',
        field2: 'base2',
      },
    },
  })

  const unrelated = new ObjectType({
    elemID: new ElemID('salto', 'unrelated'),
    fields: {
      field1: new Field(baseElemID, 'field1', BuiltinTypes.STRING, { label: 'base' }),
    },
  })

  const update1 = new ObjectType({
    elemID: baseElemID,
    fields: {
      field1: new Field(baseElemID, 'field1', updateType, { label: 'update1' }),
    },
  })

  const update2 = new ObjectType({
    elemID: baseElemID,
    fields: {
      field2: new Field(baseElemID, 'field2', updateType, { label: 'update2' }),
    },
  })

  const updateAnno = new ObjectType({
    elemID: baseElemID,
    fields: {},
    annotationTypes: {
      anno1: BuiltinTypes.STRING,
    },
  })

  const multipleUpdateAnno = new ObjectType({
    elemID: baseElemID,
    fields: {},
    annotationTypes: {
      anno1: BuiltinTypes.STRING,
    },
  })

  const updateAnnoValues = new ObjectType({
    elemID: baseElemID,
    fields: {},
    annotations: {
      anno1: 'updated',
    },
  })

  const multipleUpdateAnnoValues = new ObjectType({
    elemID: baseElemID,
    fields: {},
    annotations: {
      anno1: 'updated',
    },
  })

  const multipleUpdate1 = new ObjectType({
    elemID: baseElemID,
    fields: {
      field1: new Field(baseElemID, 'field1', updateType, { label: 'update1' }),
    },
  })

  const missingUpdate = new ObjectType({
    elemID: baseElemID,
    fields: {
      field3: new Field(baseElemID, 'field3', updateType, { label: 'update3' }),
    },
  })

  const multipleBase = new ObjectType({
    elemID: baseElemID,
    fields: {
      field1: new Field(baseElemID, 'field1', new ListType(BuiltinTypes.STRING), { label: 'base' }),
    },
  })

  const instanceElement = new InstanceElement('inst', base, {})
  const instanceElement2 = new InstanceElement('inst2', unrelated, {})

  const mergedObject = new ObjectType({
    elemID: baseElemID,
    fields: {
      field1: new Field(baseElemID, 'field1', BuiltinTypes.STRING, { label: 'update1' }),
      field2: new Field(baseElemID, 'field2', BuiltinTypes.STRING, { label: 'update2' }),
    },
    annotations: {
      anno1: 'updated',
      _default: {
        field1: 'base1',
        field2: 'base2',
      },
    },
    annotationTypes: {
      anno1: BuiltinTypes.STRING,
    },
  })

  describe('updates', () => {
    it('does not modify an element list with no updates', () => {
      const elements = [base, unrelated]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(2)
    })

    it('merges multiple update fields blocks', () => {
      const elements = [
        base,
        unrelated,
        update1,
        update2,
        updateAnno,
        updateAnnoValues,
      ]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(2)
      expect(merged[0]).toEqual(mergedObject)
    })

    it('returns the same result regardless of the elements order', () => {
      const elements = [
        update1,
        updateAnno,
        base,
        unrelated,
        update2,
        updateAnnoValues,
      ]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(2)
      expect(merged[0]).toEqual(mergedObject)
    })

    it('returns an error when multiple updates exists for same field', () => {
      const elements = [
        base,
        update1,
        multipleUpdate1,
      ]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(DuplicateAnnotationFieldDefinitionError)
    })

    it('returns an error when attempting to update a non existing field', () => {
      const elements = [
        base,
        missingUpdate,
      ]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(NoBaseDefinitionMergeError)
    })

    it('returns an error when multiple updates exists for same annotation', () => {
      const elements = [
        base,
        updateAnno,
        multipleUpdateAnno,
      ]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(DuplicateAnnotationTypeError)
    })

    it('returns an error when multiple updates exists for same annotation value', () => {
      const elements = [
        base,
        updateAnnoValues,
        multipleUpdateAnnoValues,
      ]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(DuplicateAnnotationError)
    })

    it('returns an error when multiple base field definitions', () => {
      const elements = [
        base,
        multipleBase,
      ]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(MultipleBaseDefinitionsMergeError)
      const expectedMessage = `Error merging ${errors[0].elemID.getFullName()}: Cannot merge '${errors[0].elemID.createParentID().getFullName()}': field '${errors[0].elemID.name}' has multiple definitions`
      expect(errors[0].message).toBe(expectedMessage)
      expect(String(errors[0])).toBe(expectedMessage)
    })
  })

  describe('merging placeholders', () => {
    it('update type pointers with the modified type', () => {
      const elements = [
        base,
        unrelated,
        update1,
        update2,
        updateAnno,
        updateAnnoValues,
        instanceElement,
        instanceElement2,
      ]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(4)
    })
  })

  describe('merging instances', () => {
    const strType = new PrimitiveType({
      elemID: new ElemID('salto', 'string'),
      primitive: PrimitiveTypes.STRING,
      annotations: { _default: 'type' },
    })
    const nestedElemID = new ElemID('salto', 'nested')
    const nested = new ObjectType({
      elemID: nestedElemID,
      fields: {
        field1: new Field(nestedElemID, 'field1', strType, { _default: 'field1' }),
        field2: new Field(nestedElemID, 'field2', strType),
        base: new Field(nestedElemID, 'field2', base),
      },
    })
    const ins1 = new InstanceElement(
      'ins',
      nested,
      { field1: 'ins1', field2: 'ins1' },
      undefined,
      { anno: 1 },
    )
    const ins2 = new InstanceElement(
      'ins',
      nested,
      { base: { field1: 'ins2', field2: 'ins2' } },
      undefined,
      { anno2: 1 },
    )
    const shouldUseFieldDef = new InstanceElement('ins', nested, {
      field2: 'ins1',
    })
    const shouldUseTypeDef = new InstanceElement('ins', nested, {
      field1: 'ins1',
    })

    const recursiveElemID = new ElemID('salto', 'recursive')
    const recursiveType = new ObjectType({ elemID: recursiveElemID })
    recursiveType.fields = { field: new Field(recursiveElemID, 'field', recursiveType) }
    const recursiveInstance = new InstanceElement('ins', recursiveType)

    it('should merge instances', () => {
      const elements = [ins1, ins2]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(1)
      const ins = merged[0] as InstanceElement
      expect(ins.value).toEqual({
        field1: 'ins1',
        field2: 'ins1',
        base: {
          field1: 'ins2',
          field2: 'ins2',
        },
      })
      expect(ins.annotations).toEqual({ anno: 1, anno2: 1 })
    })

    it('should use field defaults', () => {
      const elements = [shouldUseFieldDef, ins2]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      const ins = merged[0] as InstanceElement
      expect(ins.value).toEqual({
        field1: 'field1',
        field2: 'ins1',
        base: {
          field1: 'ins2',
          field2: 'ins2',
        },
      })
    })

    it('should use type defaults', () => {
      const elements = [shouldUseTypeDef, ins2]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      const ins = merged[0] as InstanceElement
      expect(ins.value).toEqual({
        field1: 'ins1',
        field2: 'type',
        base: {
          field1: 'ins2',
          field2: 'ins2',
        },
      })
    })

    it('should use object defaults', () => {
      const elements = [ins1]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      const ins = merged[0] as InstanceElement
      expect(ins.value).toEqual({
        field1: 'ins1',
        field2: 'ins1',
        base: {
          field1: 'base1',
          field2: 'base2',
        },
      })
    })

    it('should not fail with recursive types', () => {
      const elements = [recursiveInstance]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(1)
    })

    it('should fail on multiple values for same key', () => {
      const elements = [ins1, shouldUseFieldDef]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(DuplicateInstanceKeyError)
    })

    it('should fail on multiple values for same annotation', () => {
      const conflicting = ins2.clone()
      conflicting.annotations = ins1.annotations
      const { errors } = mergeElements([ins1, conflicting])
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(DuplicateAnnotationError)
    })

    it('should create default instance from type', () => {
      const mockElemID = new ElemID('test')
      const configType = new ObjectType({
        elemID: mockElemID,
        fields: {
          val1: new Field(
            mockElemID,
            'val1',
            BuiltinTypes.STRING,
            {
              [CORE_ANNOTATIONS.DEFAULT]: 'test',
            }
          ),
        },
      })
      expect(createDefaultInstanceFromType('test', configType))
        .toEqual(new InstanceElement('test', configType, { val1: 'test' }))
    })
  })

  describe('merging primitives', () => {
    const strType = new PrimitiveType({
      elemID: new ElemID('salto', 'string'),
      primitive: PrimitiveTypes.STRING,
      annotations: { _default: 'type' },
    })

    const duplicateType = new PrimitiveType({
      elemID: new ElemID('salto', 'string'),
      primitive: PrimitiveTypes.STRING,
      annotations: { _default: 'type' },
    })
    it('should fail when more then one primitive is defined with same elemID', () => {
      const elements = [strType, duplicateType]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(MultiplePrimitiveTypesUnsupportedError)
    })
  })

  describe('merging variables', () => {
    it('should fail when more then one variable is defined with same elemID', () => {
      const var1 = new Variable(new ElemID(ElemID.VARIABLES_NAMESPACE, 'varName'), 5)
      const var2 = new Variable(new ElemID(ElemID.VARIABLES_NAMESPACE, 'varName'), 5)
      const elements = [var1, var2]
      const { errors } = mergeElements(elements)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(DuplicateVariableNameError)
    })

    it('should succeed when no more then one variable is defined with same elemID', () => {
      const var1 = new Variable(new ElemID(ElemID.VARIABLES_NAMESPACE, 'varName'), 5)
      const var2 = new Variable(new ElemID(ElemID.VARIABLES_NAMESPACE, 'varName2'), 8)
      const elements = [var1, var2]
      const { merged, errors } = mergeElements(elements)
      expect(errors).toHaveLength(0)
      expect(merged).toHaveLength(2)
      const merged1 = merged[0] as Variable
      const merged2 = merged[1] as Variable
      expect(merged1.value).toEqual(5)
      expect(merged2.value).toEqual(8)
      expect(merged1.elemID.getFullName()).toEqual('var.varName')
      expect(merged2.elemID.getFullName()).toEqual('var.varName2')
    })
  })

  describe('replace type defs', () => {
    const typeRef = (typeToRef: TypeElement): ObjectType =>
      new ObjectType({ elemID: typeToRef.elemID })

    const strType = new PrimitiveType({
      elemID: new ElemID('salto', 'string'),
      primitive: PrimitiveTypes.STRING,
      annotations: { _default: 'type' },
    })

    const nestedElemID = new ElemID('salto', 'nested')

    const nested = new ObjectType({
      elemID: nestedElemID,
      fields: {
        prim: new Field(nestedElemID, 'field2', typeRef(strType)),
        base: new Field(nestedElemID, 'field2', typeRef(base)),
      },
    })

    it('should replace type refs with full types', () => {
      const { merged, errors } = mergeElements([
        strType,
        base,
        nested,
      ])
      expect(errors).toHaveLength(0)
      const element = merged[2] as ObjectType
      expect(element.fields.prim.type).toEqual(strType)
      expect(element.fields.base.type).toEqual(base)
    })
  })
})
