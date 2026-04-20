import { type Static, Type } from "@sinclair/typebox";

// Regex source strings — compiled to RegExp during coercion in config/index.ts
const RegexEntryString = Type.String();

const ReplaceEntrySchema = Type.Object(
	{
		pattern: RegexEntryString,
		replacement: Type.String(),
	},
	{ additionalProperties: true },
);

const MatchOutputEntrySchema = Type.Object(
	{
		pattern: RegexEntryString,
		message: Type.String(),
		unless: Type.Optional(RegexEntryString),
	},
	{ additionalProperties: true },
);

const RawPipelineSchema = Type.Object(
	{
		stripAnsi: Type.Optional(Type.Boolean()),
		replace: Type.Optional(Type.Array(ReplaceEntrySchema)),
		matchOutput: Type.Optional(Type.Array(MatchOutputEntrySchema)),
		stripLinesMatching: Type.Optional(Type.Array(RegexEntryString)),
		keepLinesMatching: Type.Optional(Type.Array(RegexEntryString)),
		truncateLinesAt: Type.Optional(Type.Number()),
		headLines: Type.Optional(Type.Number()),
		tailLines: Type.Optional(Type.Number()),
		maxLines: Type.Optional(Type.Number()),
		onEmpty: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

const RawRuleSchema = Type.Object(
	{
		name: Type.String(),
		matchCommand: Type.String(),
		pipeline: RawPipelineSchema,
	},
	{ additionalProperties: true },
);

export const RawConfigSchema = Type.Object(
	{
		disabled: Type.Optional(Type.Array(Type.String())),
		rules: Type.Optional(Type.Array(RawRuleSchema)),
	},
	{ additionalProperties: true },
);

export type RawConfig = Static<typeof RawConfigSchema>;
