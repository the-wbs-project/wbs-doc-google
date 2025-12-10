export const TASK_RESULTS_SCHEMA = {
    type: 'json_schema',
    json_schema: {
        name: 'tasks_result',
        strict: true,
        schema: {
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
                            }
                        },
                        required: ["wbsId", "name", "metadata"],
                        additionalProperties: false
                    }
                }
            },
            required: ["tasks"],
            additionalProperties: false
        }
    }
};


export const COMPARISON_SCHEMA = {
    type: 'json_schema',
    json_schema: {
        name: 'comparison_result',
        strict: true,
        schema: {
            type: "object",
            properties: {
                tasks: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            wbsId: { type: "string" },
                            name: { type: "string" },
                            status: { type: "string", enum: ["pass", "needs_review"] },
                            sources: { type: "array", items: { type: "string" } },
                            discrepancies: { type: "string" }
                        },
                        required: ["wbsId", "name", "status", "sources", "discrepancies"],
                        additionalProperties: false
                    }
                },
                summary: { type: "string" }
            },
            required: ["tasks", "summary"],
            additionalProperties: false
        }
    }
};