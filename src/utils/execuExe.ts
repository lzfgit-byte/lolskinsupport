import { exec } from 'child_process';
// 任何你期望执行的cmd命令，ls都可以
let cmdPath = 'C:/';
// 子进程名称
let workerProcess;

const runExec = async (cmdStr) => {
  return new Promise((resolve, reject) => {
    workerProcess = exec(cmdStr, { cwd: cmdPath });
    // 打印正常的后台可执行程序输出
    workerProcess.stdout.on('data', function (data) {
      // console.log('stdout: ' + data);
      // resolve(data);
    });
    // 打印错误的后台可执行程序输出
    workerProcess.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });
    // 退出之后的输出 0 有输出 1 是无输出
    workerProcess.on('close', function (code) {
      console.log('out code：' + code);
      resolve(code);
    });
  });
};

export default {
  execuFuc: (cmdUrl) => {
    return runExec(cmdUrl);
  },
};
