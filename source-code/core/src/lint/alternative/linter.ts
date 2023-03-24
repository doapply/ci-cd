import type { Config } from "@inlang/core/config"
import type * as ast from "@inlang/core/ast"
import type { LintedResource, LintRule, Visitors } from "./types.js"
import { createReportFunction } from "./report.js"

const getResourceForLanguage = (resources: ast.Resource[], language: string) =>
	resources.find(({ languageTag }) => languageTag.name === language)

export const lint = async (args: {
	config: Pick<Config, "lint" | "languages" | "referenceLanguage">
	resources: ast.Resource[]
}): Promise<LintedResource[]> => {
	const { referenceLanguage, languages, lint } = args.config
	const resources = structuredClone(args.resources)
	if (lint === undefined || lint.rules.length === 0) {
		return args.resources
	}
	const reference = getResourceForLanguage(resources, referenceLanguage)

	await Promise.all(
		lint.rules.flat().map((rule) =>
			processLintRule({
				rule,
				referenceLanguage,
				languages,
				reference,
				resources,
			}).catch((e) => console.error(`Unexpected error in lint rule '${rule.id}':`, e)),
		),
	)

	return resources as LintedResource[]
}

const processLintRule = async (args: {
	rule: LintRule
	referenceLanguage: string
	languages: string[]
	reference: ast.Resource | undefined
	resources: ast.Resource[]
}) => {
	const { referenceLanguage, languages, reference, resources } = args

	const report = createReportFunction(args.rule)
	const { visitors } = await args.rule.setup({ config: { referenceLanguage, languages }, report })

	for (const language of languages) {
		await processResource({
			reference,
			target: getResourceForLanguage(resources, language),
			visitors,
		})
	}
}

// --------------------------------------------------------------------------------------------------------------------

type ProcessNodeFunction<Node> = (args: {
	visitors: Visitors
	reference?: Node
	target?: Node
}) => Promise<void>

// --------------------------------------------------------------------------------------------------------------------

const shouldProcessResourceChildren = (visitors: Visitors) =>
	!!visitors.Message || shouldProcessMessageChildren(visitors)

// TODO: test passing `undefined` for reference

const processResource: ProcessNodeFunction<ast.Resource> = async ({
	visitors,
	target,
	reference,
}) => {
	const payload = visitors.Resource && (await visitors.Resource({ target: target, reference }))
	if (payload === "skip") {
		return
	}

	// process children
	if (shouldProcessResourceChildren(visitors)) {
		const processedReferenceMessages = new Set<string>()

		for (const targetMessage of target?.body ?? []) {
			const referenceMessage = reference?.body.find(({ id }) => id.name === targetMessage.id.name)

			await processMessage({
				visitors,
				reference: referenceMessage,
				target: targetMessage,
			})

			if (referenceMessage) {
				processedReferenceMessages.add(referenceMessage.id.name)
			}
		}

		const nonVisitedReferenceMessages = reference?.body.filter(
			({ id }) => !processedReferenceMessages.has(id.name),
		)
		for (const referenceNode of nonVisitedReferenceMessages ?? []) {
			await processMessage({
				visitors,
				reference: referenceNode,
				target: undefined,
			})
			processedReferenceMessages.add(referenceNode.id.name)
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------

const shouldProcessMessageChildren = (visitors: Visitors) => !!visitors.Pattern

const processMessage: ProcessNodeFunction<ast.Message> = async ({
	visitors,
	target,
	reference,
}) => {
	const payload = visitors.Message && (await visitors.Message({ target, reference }))
	if (payload === "skip") {
		return
	}

	// process children
	if (shouldProcessMessageChildren(visitors)) {
		await processPattern({
			visitors,
			reference: reference?.pattern,
			target: target?.pattern,
		})
	}
}

// --------------------------------------------------------------------------------------------------------------------

const processPattern: ProcessNodeFunction<ast.Pattern> = async ({
	visitors,
	target,
	reference,
}) => {
	const payload = visitors.Pattern && (await visitors.Pattern({ target, reference }))
	if (payload === "skip") {
		return
	}
}
