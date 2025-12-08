package com.example;

import io.javalin.Javalin;
import net.sf.mpxj.ProjectFile;
import net.sf.mpxj.Task;
import net.sf.mpxj.reader.UniversalProjectReader;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MppService {
    public static void main(String[] args) {
        Javalin app = Javalin.create().start(8080);

        app.post("/parse", ctx -> {
            String fileUrl = ctx.body(); // Expecting a URL to the file
            if (fileUrl == null || fileUrl.isEmpty()) {
                ctx.status(400).result("Missing file URL");
                return;
            }

            try (InputStream stream = new URL(fileUrl).openStream()) {
                UniversalProjectReader reader = new UniversalProjectReader();
                ProjectFile project = reader.read(stream);

                List<Map<String, Object>> tasks = new ArrayList<>();
                for (Task task : project.getTasks()) {
                    Map<String, Object> taskMap = new HashMap<>();
                    taskMap.put("id", task.getID());
                    taskMap.put("name", task.getName());
                    taskMap.put("outlineLevel", task.getOutlineLevel());
                    taskMap.put("start", task.getStart());
                    taskMap.put("finish", task.getFinish());
                    tasks.add(taskMap);
                }

                ObjectMapper mapper = new ObjectMapper();
                ctx.json(tasks);
            } catch (Exception e) {
                e.printStackTrace();
                ctx.status(500).result("Error parsing file: " + e.getMessage());
            }
        });
    }
}
