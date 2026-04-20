import { type Static, Type } from "@sinclair/typebox";

const RawPipelineSchema = Type.Object({}, { additionalProperties: true });

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
