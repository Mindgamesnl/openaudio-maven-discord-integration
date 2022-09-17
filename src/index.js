const core = require('@actions/core');
const github = require('@actions/github');
const child_process = require('child-process-promise');

const analysis = require('../src/analysis.js');
const webhook = require('../src/discord.js');

async function run() {
	const payload = github.context.payload;
	const repository = payload.repository.full_name;
	const commits = payload.commits;
	const size = commits.length;
	const branch = payload.ref.split('/')[payload.ref.split('/').length - 1];

	console.log(`Received payload ${JSON.stringify(payload, null, 2)}`);
	console.log(`Received ${commits.length}/${size} commits...`);

	if (commits.length === 0) {
        // This was likely a "--tags" push.
        console.log(`Aborting analysis, found no commits.`);
		return;
	}

    const id = core.getInput("id");
    const token = core.getInput("token");

	// build it once, then do the analysis twice
	console.log("Running 'mvn install'...");
	var args = ["install", "-B"];
	if (skip) {
		args.push("-DskipTests");
	}

	var maven = child_process.spawn("mvn", args, { shell: true });

	maven.childProcess.stdout.on('data', data => process.stdout.write(data.toString('utf8')));
	maven.childProcess.stderr.on('data', data => process.stdout.write(data.toString('utf8')));

	// await its result
	maven.then(() => buildReports(null), buildReports);
}

async function buildReports(mvnErr) {
	analysis.start(isSkipped(payload.head_commit), './plugin/', err).then((report) => {
        webhook.send(id, token, repository + " (plugin)", branch, payload.compare, commits, size, report).catch(err => core.setFailed(err.message));
    }, err => core.setFailed(err));

	analysis.start(isSkipped(payload.head_commit), './module-src/vistas-server/', err).then((report) => {
        webhook.send(id, token, repository + " (vistas-server)", branch, payload.compare, commits, size, report).catch(err => core.setFailed(err.message));
    }, err => core.setFailed(err));

}

try {
	run();
} catch (error) {
    core.setFailed(error.message);
}

function isSkipped(commit) {
	return commit.message.toLowerCase().includes("[skip]");
}
