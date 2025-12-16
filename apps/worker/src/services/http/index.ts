import { deleteModelResult, getProject, getProjects, promoteModel, refineProject, rerunModel, updateProject } from "./project";
import { refine } from "./refine";
import { workflowStart, workflowStatus } from "./workflow";

export const HTTP = {
    workflowStart: workflowStart,
    workflowStatus: workflowStatus,
    getProjects: getProjects,
    getProject: getProject,
    deleteModelResult: deleteModelResult,
    refineProject: refineProject,
    rerunModel: rerunModel,
    promoteModel: promoteModel,
    updateProject: updateProject,
    refine: refine
};
