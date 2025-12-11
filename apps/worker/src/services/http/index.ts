import { deleteModelResult, getModelInfo, getProject, promoteModel, refineProject, rerunModel, updateProject } from "./project";
import { workflowStart, workflowStatus } from "./workflow";

export const HTTP = {
    workflowStart: workflowStart,
    workflowStatus: workflowStatus,
    getProject: getProject,
    deleteModelResult: deleteModelResult,
    refineProject: refineProject,
    rerunModel: rerunModel,
    promoteModel: promoteModel,
    updateProject: updateProject,
    getModelInfo: getModelInfo
};
