const core = require('@actions/core');
const github = require('@actions/github');
const { exec } = require('@actions/exec');

async function run() {
  try {
    const token = process.env.GITHUB_TOKEN;
    const octokit = github.getOctokit(token);
    const context = github.context;

    const runs = await octokit.rest.actions.listWorkflowRuns({
      owner: context.repo.owner,
      repo: context.repo.repo,
      workflow_id: 'release.yml',
      branch: context.ref.replace('refs/heads/', ''),
      status: 'success',
      per_page: 1
    });

    let startSha = null;
    if (runs.data.workflow_runs.length > 0) {
      startSha = runs.data.workflow_runs[0].head_sha;
      console.log(`Found last successful run: ${runs.data.workflow_runs[0].html_url}`);
      console.log(`Head SHA: ${startSha}`);
    }

    // If no successful run found, get the first commit
    if (!startSha) {
      console.log('No previous successful run found, using first commit');
      let output = '';
      await exec('git', ['rev-list', '--max-parents=0', 'HEAD'], {
        listeners: {
          stdout: (data) => {
            output += data.toString();
          }
        }
      });
      startSha = output.trim();
    }

    // Get all commits between startSha and current SHA
    const endSha = context.sha;
    console.log(`Collecting commits from ${startSha} to ${endSha}`);

    let commits = [];
    let output = '';
    
    // Get commit SHAs
    await exec('git', ['rev-list', '--reverse', `${startSha}..${endSha}`], {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        }
      }
    });

    const shas = output.trim().split('\n').filter(Boolean);

    for (const sha of shas) {
      let messageOutput = '';
      await exec('git', ['log', '-1', '--format=%s', sha], {
        listeners: {
          stdout: (data) => {
            messageOutput += data.toString();
          }
        }
      });
      
      commits.push({
        sha: sha,
        message: messageOutput.trim()
      });
    }

    const matrix = {
      commit: commits
    };

    core.setOutput('commit-matrix', JSON.stringify(matrix));   
    console.log('Matrix content:', JSON.stringify(matrix, null, 2));

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();