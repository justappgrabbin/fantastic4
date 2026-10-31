package com.fourcorners.computer;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.provider.OpenableColumns;
import android.net.Uri;
import android.graphics.Color;
import android.widget.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipEntry;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Native Android workspace with authenticated, phone-local Linux execution. No WebView. */
public class MainActivity extends Activity {
    private SQLiteDatabase database;
    private LinuxRuntime runtime;
    private String sessionToken;
    private volatile boolean closing;
    private File pendingExport;
    private LinearLayout body;
    private TextView status;
    private Button intake;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final String[] names = {"Tool Factory", "Neural Net Maker", "Model Maker", "ATO Engine"};
    private final String[] directives = {
        "Preserve supplied tools. Inspect interfaces and dependencies. Require evidence before claiming execution.",
        "Use the supplied neural-net primitives engine to build and evaluate networks. Report measured results.",
        "Create models with explicit qualities and configuration provenance. Preserve the user's rules.",
        "Coordinate work across all four agents. Record outputs and failures. Verify changes before adoption."
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        database = openOrCreateDatabase("workspace.db", MODE_PRIVATE, null);
        database.execSQL("CREATE TABLE IF NOT EXISTS packages(id TEXT PRIMARY KEY,name TEXT,digest TEXT,bytes INTEGER,inventory TEXT)");
        database.execSQL("CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,agent TEXT,directive TEXT,status TEXT)");
        sessionToken = getPreferences(MODE_PRIVATE).getString("runtimeToken", null);
        if (sessionToken == null) { sessionToken = UUID.randomUUID().toString() + UUID.randomUUID().toString(); getPreferences(MODE_PRIVATE).edit().putString("runtimeToken", sessionToken).apply(); }
        runtime = new LinuxRuntime(this, sessionToken);
        home();
        worker.execute(() -> {
            try { runtime.startAndVerify(); runOnUiThread(() -> { if (!closing) status.setText("Local Linux engine ready · original tool belts connected"); }); }
            catch (Exception error) { runOnUiThread(() -> { if (!closing) status.setText("Linux engine unavailable: " + error.getMessage()); }); }
        });
    }
    private TextView text(String value, int size) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size);
        view.setTextColor(Color.rgb(226,233,219)); view.setPadding(0,14,0,14); body.addView(view); return view;
    }
    private Button button(String label, Runnable action) {
        Button view = new Button(this); view.setText(label); body.addView(view);
        view.setOnClickListener(v -> action.run()); return view;
    }
    private void screen(String title) {
        ScrollView scroll = new ScrollView(this); body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL);
        int padding=(int)(24*getResources().getDisplayMetrics().density); body.setPadding(padding,padding,padding,padding);
        body.setBackgroundColor(Color.rgb(18,26,21)); scroll.addView(body); setContentView(scroll); text(title,30);
    }
    private void home() {
        screen("Fantastic4"); text("Your workspace lives on this phone.",16);
        text("Original ATO, Tool Factory and neural-composition engines · no autonomous model planner yet.",14);
        intake = button("Bring a piece", () -> {
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT); pick.setType("*/*"); pick.addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(pick,1);
        });
        status = text("Sources are retained in private device storage.",14);
        for (int i=0;i<names.length;i++) { final int corner=i; button(names[i], () -> agent(corner)); }
        button("Engine jobs & results", this::engineJobs);
        button("Created programs & artifacts", this::artifacts);
        text("Your pieces",22);
        try(Cursor cursor=database.rawQuery("SELECT id,name FROM packages ORDER BY rowid DESC",null)) {
            if(cursor.getCount()==0) text("Nothing imported yet.",16);
            while(cursor.moveToNext()) { final String id=cursor.getString(0); button(cursor.getString(1), () -> piece(id)); }
        }
        text("Human Design · awaiting original rules\nSpaceTime semantics · awaiting original rules\nYi Jing · supplied Python source preserved separately; Android adapter pending",14);
    }
    private void agent(int index) {
        screen(names[index]); text(directives[index],18);
        text(index==2?"Original Modelmaker source retained. Inspection connected; training dependencies pending.":"Original engine adapter installed. Execution requires the local Linux engine to be ready.",15);
        EditText task=new EditText(this); task.setHint("Give this agent a directive"); task.setTextColor(Color.WHITE); task.setHintTextColor(Color.LTGRAY); body.addView(task);
        button("Save directive", () -> {
            String value=task.getText().toString().trim(); if(value.isEmpty()) {task.setError("Enter a directive");return;}
            database.execSQL("INSERT INTO jobs VALUES(?,?,?,?)",new Object[]{UUID.randomUUID().toString(),names[index],value,"Saved directive · autonomous planner not connected"});
            agent(index);
        });
        try(Cursor c=database.rawQuery("SELECT directive,status FROM jobs WHERE agent=? ORDER BY rowid DESC",new String[]{names[index]})) {
            while(c.moveToNext()) text(c.getString(0)+"\n"+c.getString(1),15);
        }
        text("Run the original tool belt",22);
        EditText parameters = new EditText(this); parameters.setTextColor(Color.WHITE); parameters.setMinLines(3); body.addView(parameters);
        String[] examples = {
            "{\"request\":{\"purpose\":\"orchestrate a workflow system\",\"dimension\":\"Space\"},\"input\":\"sense build test mount\"}",
            "{\"configuration\":{\"seed\":1,\"nodeCount\":4},\"input\":[0,0,0,0]}",
            "{}",
            "{\"requests\":[{\"purpose\":\"analyze and learn\",\"dimension\":\"Evolution\",\"level\":4},{\"purpose\":\"create grammar rule\",\"dimension\":\"Design\",\"level\":5}],\"input\":\"signal\"}"
        };
        parameters.setText(examples[index]);
        text("Editable engine inputs. These examples do not apply a personal birth configuration.",13);
        button(index==2?"Inspect Modelmaker":"Run tool belt", () -> {
            try {
                String[] capabilities={"tool.create","neural.compose","modelmaker.inspect","ato.connect"};
                JSONObject job=new JSONObject(); job.put("capability",capabilities[index]); job.put("parameters",new JSONObject(parameters.getText().toString()));
                worker.execute(() -> {try { String result=engineRequest("POST","/api/jobs",job.toString()); runOnUiThread(() -> {if(!closing)engineJobs();}); }
                    catch(Exception error){runOnUiThread(() -> {if(!closing)parameters.setError(error.getMessage());});}});
            }catch(Exception error){parameters.setError("Enter valid engine inputs as a JSON object");}
        });
        button("Workspace",this::home);
    }
    private String engineRequest(String method,String path,String body) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL("http://127.0.0.1:4183"+path).openConnection();
        connection.setConnectTimeout(1500); connection.setReadTimeout(5000); connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization","Bearer "+sessionToken);
        try {
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            int code=connection.getResponseCode(); InputStream stream=code<400?connection.getInputStream():connection.getErrorStream();
            ByteArrayOutputStream output=new ByteArrayOutputStream(); if(stream!=null)try(InputStream in=stream){byte[] block=new byte[8192];int n;while((n=in.read(block))!=-1){if(output.size()+n>4*1024*1024)throw new IOException("Engine response exceeds display limit");output.write(block,0,n);}}
            String result=output.toString("UTF-8");if(code>=400)throw new IOException(result);return result;
        }finally{connection.disconnect();}
    }
    private void engineJobs(){
        screen("Engine jobs & results");TextView report=text("Reading local engine…",14);report.setTextIsSelectable(true);
        button("Refresh",this::engineJobs);button("Workspace",this::home);
        worker.execute(() -> {try{String response=new JSONObject(engineRequest("GET","/api/status",null)).toString(2);runOnUiThread(() -> {if(!closing)report.setText(response);});}
            catch(Exception error){runOnUiThread(() -> {if(!closing)report.setText("Local engine unavailable: "+error.getMessage());});}});
    }
    private void artifacts() {
        screen("Created programs & artifacts");
        text("Outputs from your local engines. Originals remain in the workspace when you save a copy.",15);
        File root=new File(getFilesDir(),"fantastic4-data/artifacts"); File[] jobs=root.listFiles();int count=0;
        if(jobs!=null)for(File job:jobs){if(!job.isDirectory())continue;File[] outputs=job.listFiles();if(outputs==null)continue;
            for(File file:outputs){if(!file.isFile())continue;count++;button(file.getName(), () -> artifact(file));}}
        if(count==0)text("No output artifacts yet. Run a connected tool belt first.",16);
        button("Workspace",this::home);
    }
    private void artifact(File file) {
        screen(file.getName());
        try {byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());if(bytes.length>2*1024*1024)throw new IOException("Use Save a copy for this large artifact");text(new String(bytes,StandardCharsets.UTF_8),14).setTextIsSelectable(true);}
        catch(Exception error){text(error.getMessage(),14);}
        button("Save a copy", () -> {pendingExport=file;Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/octet-stream");save.putExtra(Intent.EXTRA_TITLE,file.getName());startActivityForResult(save,2);});
        button("Artifacts",this::artifacts);
    }
    private void piece(String id) {
        screen("Preserved piece");
        try(Cursor c=database.rawQuery("SELECT name,digest,bytes,inventory FROM packages WHERE id=?",new String[]{id})) {
            if(c.moveToFirst()) {text(c.getString(0),24); text("Inspected · execution not verified",16);text(c.getLong(2)+" bytes\nSHA-256\n"+c.getString(1),13);text(c.getString(3),14);}
        }
        button("Workspace",this::home);
    }
    @Override protected void onActivityResult(int request,int result,Intent intent) {
        super.onActivityResult(request,result,intent);
        if(request==2&&result==RESULT_OK&&intent!=null&&intent.getData()!=null&&pendingExport!=null){
            File file=pendingExport;pendingExport=null;Uri destination=intent.getData();worker.execute(() -> {
                try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(destination)){
                    if(out==null)throw new IOException("Destination unavailable");byte[] block=new byte[32768];int n;while((n=in.read(block))!=-1)out.write(block,0,n);
                    runOnUiThread(() -> {if(!closing)Toast.makeText(this,"Artifact copy saved",Toast.LENGTH_LONG).show();});
                }catch(Exception error){runOnUiThread(() -> {if(!closing)Toast.makeText(this,"Save failed: "+error.getMessage(),Toast.LENGTH_LONG).show();});}
            });return;
        }
        if(request!=1||result!=RESULT_OK||intent==null||intent.getData()==null)return;
        Uri uri=intent.getData(); intake.setEnabled(false); status.setText("Preserving and inspecting…");
        worker.execute(() -> {
            try {importPiece(uri);runOnUiThread(() -> {if(!isDestroyed())home();});}
            catch(Exception error) {runOnUiThread(() -> {if(!isDestroyed()){status.setText("Import failed: "+error.getMessage());intake.setEnabled(true);}});}
        });
    }
    private void importPiece(Uri uri) throws Exception {
        String name="Imported piece";
        try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {if(c!=null&&c.moveToFirst())name=c.getString(0);}
        File originals=new File(getFilesDir(),"fantastic4-data/originals"); if(!originals.exists()&&!originals.mkdirs())throw new IOException("Cannot create storage");
        String id=UUID.randomUUID().toString();File saved=new File(originals,id);long size=0;
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(saved)) {
                if(in==null)throw new IOException("File unavailable");byte[] block=new byte[32768];int n;
                while((n=in.read(block))!=-1){size+=n;if(size>256L*1024*1024)throw new IOException("Package exceeds 256 MB");digest.update(block,0,n);out.write(block,0,n);}
            }
            if(size==0)throw new IOException("Empty file");
            StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format("%02x",b&255));
            StringBuilder inventory=new StringBuilder();
            try(ZipInputStream zip=new ZipInputStream(new FileInputStream(saved))) {
                ZipEntry entry;int count=0;long expanded=0;byte[] block=new byte[32768];
                while((entry=zip.getNextEntry())!=null) {
                    if(++count>20000)throw new IOException("Too many archive entries");
                    if(count<=1000)inventory.append(entry.getName()).append('\n');
                    int n;while((n=zip.read(block))!=-1){expanded+=n;if(expanded>512L*1024*1024)throw new IOException("Archive expands beyond inspection limit");}
                }
                if(count==0)inventory.append("Single file retained; no ZIP entries found.");
                else inventory.append("\n").append(count).append(" entries; first 1,000 displayed. No code executed.");
            }
            database.execSQL("INSERT INTO packages VALUES(?,?,?,?,?)",new Object[]{id,name,hash.toString(),size,inventory.toString()});
        } catch(Exception error){saved.delete();throw error;}
    }
    @Override protected void onDestroy(){closing=true;if(runtime!=null)runtime.cancel();super.onDestroy();worker.shutdownNow();}
}
