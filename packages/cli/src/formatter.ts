import _ from 'lodash'
import chalk from 'chalk'
import wu from 'wu'
import {
  isType, Element, Type, isInstanceElement, Values, Change, Value, getChangeElement, ElemID,
  isObjectType, isField, isPrimitiveType, Field, PrimitiveTypes,
} from 'adapter-api'
import {
  Plan, PlanItem, FoundSearchResult, SearchResult, DetailedChange,
} from 'salto'
import Prompts from './prompts'


export const header = (txt: string): string => chalk.bold(txt)

export const subHeader = (txt: string): string => chalk.grey(txt)

export const body = (txt: string): string => chalk.reset(txt)

export const warn = (txt: string): string => chalk.red(txt)

export const emptyLine = (): string => ''

export const seperator = (): string => `\n${'-'.repeat(78)}\n`

const fullName = (change: Change): string => getChangeElement(change).elemID.getFullName()

const planItemName = (step: PlanItem): string => fullName(step.parent())

const indent = (text: string, level: number): string => {
  const indentText = _.repeat('  ', level)
  return text.split('\n').map(line => `${indentText}${line}`).join('\n')
}

const formatValue = (value: Element | Value): string => {
  const formatAnnotations = (annotations: Values): string =>
    (_.isEmpty(annotations) ? '' : formatValue(annotations))
  const formatAnnotationTypes = (types: Record<string, Type>): string =>
    (_.isEmpty(types) ? '' : indent(`\nannotations:${formatValue(types)}`, 2))
  const formatFields = (fields: Record<string, Field>): string =>
    (_.isEmpty(fields) ? '' : indent(`\nfields:${formatValue(fields)}`, 2))

  if (isInstanceElement(value)) {
    return formatValue(value.value)
  }
  if (isObjectType(value)) {
    return [
      formatAnnotations(value.annotations),
      formatFields(value.fields),
      formatAnnotationTypes(value.annotationTypes),
    ].join('')
  }
  if (isPrimitiveType(value)) {
    const primitiveTypenames = {
      [PrimitiveTypes.STRING]: 'string',
      [PrimitiveTypes.NUMBER]: 'number',
      [PrimitiveTypes.BOOLEAN]: 'boolean',
    }
    return [
      indent(`\nTYPE: ${primitiveTypenames[value.primitive]}`, 2),
      formatAnnotations(value.annotations),
      formatAnnotationTypes(value.annotationTypes),
    ].join('')
  }
  if (isField(value)) {
    return [
      indent(`\nTYPE: ${value.type.elemID.getFullName()}`, 2),
      formatAnnotations(value.annotations),
    ].join('')
  }
  if (_.isArray(value)) {
    return `[${value.map(formatValue)}]`
  }
  if (_.isPlainObject(value)) {
    const formattedKeys = _.entries(value)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join('\n')
    return `\n${indent(formattedKeys, 2)}`
  }
  return JSON.stringify(value)
}

const formatChangeData = (change: DetailedChange): string => {
  if (change.action === 'modify') {
    if (change.data.before === undefined || change.data.after === undefined) {
      // This is a dummy change created just so we print a "title" for a group of changes
      return ''
    }
    return `${formatValue(change.data.before)} => ${formatValue(change.data.after)}`
  }
  return formatValue(_.get(change.data, 'before', _.get(change.data, 'after')))
}

export const formatChange = (change: DetailedChange): string => {
  const modifier = Prompts.MODIFIERS[change.action]
  const id = change.id.nameParts.length === 1
    ? change.id.getFullName()
    : change.id.nameParts.slice(-1)[0]
  return indent(`${modifier} ${id}: ${formatChangeData(change)}`, change.id.nameParts.length)
}

const createCountPlanItemTypesOutput = (plan: Plan): string => {
  const items = wu(plan.itemsByEvalOrder())
    .map(item => ({ action: item.parent().action, name: planItemName(item) }))
    .unique().toArray()
  const counter = _.countBy(items, 'action')
  return (
    `${chalk.bold('Plan: ')}${counter.add || 0} to add`
    + `, ${counter.modify || 0} to change`
    + `, ${counter.remove || 0} to remove.`
  )
}

const createPlanStepsOutput = (plan: Plan): string => {
  const addMissingEmptyChanges = (changes: DetailedChange[]): DetailedChange[] => {
    const emptyChange = (id: ElemID): DetailedChange => ({
      action: 'modify',
      data: { before: undefined, after: undefined },
      id,
    })

    const createMissingChanges = (id: ElemID, existingIds: Set<string>): DetailedChange[] => {
      const parentId = id.createParentID()
      if (parentId.nameParts.length === 0 || existingIds.has(parentId.getFullName())) {
        return []
      }
      existingIds.add(parentId.getFullName())
      return [emptyChange(parentId), ...createMissingChanges(parentId, existingIds)]
    }

    const existingIds = new Set(changes.map(c => c.id.getFullName()))
    const missingChanges = _(changes)
      .map(change => createMissingChanges(change.id, existingIds))
      .flatten()
      .value()
    return [...changes, ...missingChanges]
  }

  return wu(plan.itemsByEvalOrder())
    .map(item => wu(item.detailedChanges()).toArray())
    // Fill in all missing "levels" of each change
    .map(addMissingEmptyChanges)
    // Sort changes so they show up nested correctly
    .map(changes => _.sortBy(changes, change => change.id.getFullName()))
    // Format changes
    .map(changes => changes.map(formatChange))
    .flatten()
    .toArray()
    .join('\n\n')
}

const formatElementDescription = (element: Element): string => {
  if (isType(element) && element.annotations.description) {
    return [emptyLine(), element.annotations.description].join('\n')
  }
  return emptyLine()
}

const getElapsedTime = (start: Date): number => Math.ceil(
  (new Date().getTime() - start.getTime()) / 1000,
)

export const createPlanOutput = (plan: Plan): string => {
  if (_.isEmpty(plan)) {
    return [
      emptyLine(),
      Prompts.EMPTY_PLAN,
      emptyLine(),
    ].join('\n')
  }
  const actionCount = createCountPlanItemTypesOutput(plan)
  const planSteps = createPlanStepsOutput(plan)
  return [
    header(Prompts.STARTPLAN),
    subHeader(Prompts.EXPLAINPLAN),
    seperator(),
    subHeader(Prompts.EXPLAINPLANRESULT),
    emptyLine(),
    planSteps,
    emptyLine(),
    actionCount,
    subHeader(Prompts.PLANDISCLAIMER),
  ].join('\n')
}

export const formatSearchResults = (result: SearchResult): string => {
  const notifyDescribeNoMatch = (): string => warn(Prompts.DESCRIBE_NOT_FOUND)
  const notifyDescribeNearMatch = (searchResult: FoundSearchResult): string => [
    header(Prompts.DESCRIBE_NEAR_MATCH),
    emptyLine(),
    subHeader(`\t${Prompts.DID_YOU_MEAN} ${chalk.bold(searchResult.key)}?`),
    emptyLine(),
  ].join('\n')

  if (!(result && result.element)) {
    return notifyDescribeNoMatch()
  }
  if (result.isGuess) {
    return notifyDescribeNearMatch(result)
  }
  const { element } = result
  const elementName = element.elemID.getFullName()
  const title = header(`=== ${elementName} ===`)
  const description = subHeader(formatElementDescription(element))
  // TODO - Change to dump HCL
  const elementHcl = body(JSON.stringify(element, null, 2))
  return [title, description, elementHcl].join('\n')
}

export const createItemDoneOutput = (item: PlanItem, startTime: Date): string => {
  const elapsed = getElapsedTime(startTime)
  return `${planItemName(item)}: `
        + `${Prompts.ENDACTION[item.parent().action]} `
        + `completed after ${elapsed}s`
}

export const createActionStartOutput = (action: PlanItem): string => {
  const output = [
    emptyLine(),
    body(
      `${planItemName(action)}: ${Prompts.STARTACTION[action.parent().action]}...`
    ),
  ]
  return output.join('\n')
}

export const createActionInProgressOutput = (action: PlanItem, start: Date): string => {
  const elapsed = getElapsedTime(start)
  const elapsedRound = Math.ceil((elapsed - elapsed) % 5)
  return body(`${planItemName(action)}: Still ${
    Prompts.STARTACTION[action.parent().action]
  }... (${elapsedRound}s elapsed)`)
}