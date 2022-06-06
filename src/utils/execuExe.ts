import { exec } from 'child_process';
// 任何你期望执行的cmd命令，ls都可以
let cmdStr1 = 'start /min C:\\Fraps\\LOLPRO.exe';
let cmdPath = 'C:/';
// 子进程名称
let workerProcess;

function runExec(cmdStr) {
  workerProcess = exec(cmdStr, { cwd: cmdPath });
  // 打印正常的后台可执行程序输出
  workerProcess.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
  });
  // 打印错误的后台可执行程序输出
  workerProcess.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });
  // 退出之后的输出
  workerProcess.on('close', function (code) {
    console.log('out code：' + code);
  });
}
export default {
  execuFuc: () => {
    runExec(cmdStr1);
  },
};
