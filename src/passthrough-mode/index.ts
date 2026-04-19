import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface PassthroughFlag {
	active: boolean;
}

export function createPassthroughFlag(): PassthroughFlag {
	return { active: false };
}

export function registerPassthroughCommand(api: ExtensionAPI, flag: PassthroughFlag): void {
	api.registerCommand("token-saver:passthrough", {
		description: "Bypass filtering for the next Bash command (one-shot)",
		handler: async (_args, _ctx) => {
			flag.active = true;
			api.sendMessage(
				{
					customType: "token-saver:passthrough",
					content: "Passthrough armed — next filtered command will bypass the filter.",
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
