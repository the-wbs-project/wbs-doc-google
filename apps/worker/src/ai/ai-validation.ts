import { z } from "zod";

export const MetadataItemSchema = z.object({
    key: z.string(),
    value: z.string(),
});

export const TreeTaskSchema = z.object({
    wbsId: z.string(),
    name: z.string(),
    metadata: z.array(MetadataItemSchema).default([]),
});

export const ResponseSchema = z.object({
    tasks: z.array(TreeTaskSchema),
});

export const ComparedTaskSchema = z.object({
    wbsId: z.string(),
    name: z.string(),
    status: z.enum(['pass', 'needs_review']),
    sources: z.array(z.string()),
    discrepancies: z.string().optional(),
});

export const ComparisonResponseSchema = z.object({
    tasks: z.array(ComparedTaskSchema),
    summary: z.string(),
});

export const AiTaskSchema = {
    type: "object",
    properties: {
        tasks: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    wbsId: { type: "string" },
                    name: { type: "string" },
                    metadata: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" }
                            },
                            required: ["key", "value"],
                            additionalProperties: false
                        }
                    },
                },
                required: ["wbsId", "name"],
                additionalProperties: false
            }
        }
    },
    required: ["tasks"],
    additionalProperties: false
};


export const GEMINI_TASK_SCHEMA = {
    type: "ARRAY",
    items: {
        type: "OBJECT",
        properties: {
            wbsId: { type: "STRING" },
            name: { type: "STRING" },
            metadata: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        key: { type: "STRING" },
                        value: { type: "STRING" }
                    },
                    required: ["key", "value"]
                }
            },
        },
        required: ["wbsId", "name", "metadata"]
    }
};

export const GEMINI_COMPARISON_SCHEMA = {
    type: "OBJECT",
    properties: {
        tasks: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    wbsId: { type: "STRING" },
                    name: { type: "STRING" },
                    status: { type: "STRING", enum: ["pass", "needs_review"] },
                    sources: {
                        type: "ARRAY", items: {
                            type: "OBJECT",
                            properties: {
                                model: { type: "STRING" },
                                taskId: { type: "STRING" },
                            },
                            required: ["model", "taskId"]
                        }
                    },
                    discrepancies: { type: "STRING" }
                },
                required: ["wbsId", "name", "status", "sources"]
            }
        },
        summary: { type: "STRING" }
    },
    required: ["tasks", "summary"]
};
