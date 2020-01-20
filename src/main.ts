import axios from "axios";
import { get } from 'lodash';
import { EOL } from "os";

interface ApiError {
  message: string;
  statusCode: number;
  headers: any[];
}

const api = () => {
  const instance = axios.create({ baseURL: "https://api.github.com" });
  instance.interceptors.request.use(request => request, error => {
    const message = get(error, 'response.data.message', error.message);
    const statusCode = get(error, 'response.status');
    const headers = get(error, 'response.headers');

    const e: ApiError = { message, statusCode, headers };

    return Promise.reject(e);
  });

  return instance;
};

class Editor {
  constructor(public repoPath: string) { }

  private repo = "stock-urls";
  private branch = "master";
  private username = "piczmar";
  private token = `.....`; // Base64 encoded username:password
  private api = api();

  private getHeaders = () => {
    return {
      headers: {
        Authorization: `Basic ${this.token}`
      }
    }
  }
  async lastCommit(): Promise<string> {
    const response = await this.api.get(`/repos/${this.username}/${this.repo}/git/refs/heads/${this.branch}`, this.getHeaders());

    return response.data.object.sha;
  }

  async treeFor(commitSha: string) {
    const response = await this.api.get(`/repos/${this.username}/${this.repo}/git/commits/${commitSha}`, this.getHeaders());
    return response.data.tree.sha;
  }

  async createTree(file: string, content: string, lastTree: string) {
    const newTree = {
      "base_tree": lastTree,
      "tree": [
        {
          "path": file,
          "mode": "100644",
          "type": "blob",
          "content": content
        }
      ]
    }

    /*
curl -X POST -u piczmar:3bf171bcc4030d87c484e4f092c916789fea0af5 \
https://api.github.com/repos/piczmar/test-private-repo-page/git/trees \
-d '{"base_tree":"e7026cbfd253a099552056662d3c9e4db779bf9b","tree":[{"path":"test.md","mode":"100644","type":"blob","content":"test message 1"}]}'

curl -X POST -H 'Authorization: Basic cGljem1hcjozYmYxNzFiY2M0MDMwZDg3YzQ4NGU0ZjA5MmM5MTY3ODlmZWEwYWY1' \
 -H 'content-type: application/json' \
https://api.github.com/repos/piczmar/test-private-repo-page/git/trees \
-d '{"base_tree":"e7026cbfd253a099552056662d3c9e4db779bf9b","tree":[{"path":"test.md","mode":"100644","type":"blob","content":"test message 1"}]}'

    */

    console.log(JSON.stringify(newTree))
    const response = await this.api.post(`/repos/${this.username}/${this.repo}/git/trees`, JSON.stringify(newTree), this.getHeaders());

    return response.data.sha;
  }

  async createCommit(message: string, treeSha: string, parent: string) {
    const commit = { 'message': message, 'parents': [parent], 'tree': treeSha }

    // commit["author"] =  {'name' : name, 'email' : email} 

    const response = await this.api.post(`/repos/${this.username}/${this.repo}/git/commits`, commit, this.getHeaders());

    return response.data.sha;
  }

  async updateBranch(newCommitSha: string) {
    const ref = { 'sha': newCommitSha }
    await this.api.post(`/repos/${this.username}/${this.repo}/git/refs/heads/${this.branch}`, ref, this.getHeaders());
  }

  async updateFile(file: string, message: string, content: string) {
    const lastCommitSha = await this.lastCommit()
    console.log(`last commit sha: ${lastCommitSha}`)
    const lastTree = await this.treeFor(lastCommitSha)
    console.log(`last tree: ${lastTree}`)
    const treeSha = await this.createTree(file, content, lastTree)
    console.log(`new tree sha: ${treeSha}`)
    const newCommitSha = await this.createCommit(message, treeSha, lastCommitSha)
    console.log(`new commit sha: ${newCommitSha}`)
    await this.updateBranch(newCommitSha)
  }

  async readFile(file: string) {
    const response = await this.api.get(`/repos/${this.username}/${this.repo}/contents/${file}`, this.getHeaders());
    const contentBase64 = response.data.content;
    const buff = new Buffer(contentBase64, 'base64');

    return buff.toString('ascii');
  }

  async appendFile(file: string, message: string, content: string) {
    const oldContent = await this.readFile(file);
    const newContent = oldContent + content;

    return this.updateFile(file, message, newContent);
  }
}

const editor = new Editor("path");

console.log(editor.repoPath);

editor.appendFile('test.md', 'new revision', `${EOL} new line ${new Date().toISOString()}`)
  .then(console.log)
  .catch((error: ApiError) => {

    console.log(`ERROR: ${JSON.stringify(error)}`)
  });

/*


ed = Editor.new('testcollab/rails-test')
if ed.update_file('README.txt', 'my message', 'my new content')
  ed.set_author('Scott', 'schacon@gmail.com')
  ed.update_file('README.2.txt', 'my message', 'my new content')
end


class Editor
  include HTTParty

  attr_accessor :repo, :branch, :author

  base_uri 'https://api.github.com'
  basic_auth USER, PASS
  default_params :output => 'json'
  format :json

  def initialize(repo, branch = 'master')
    @repo = repo
    @branch = branch
    @author = false
  end

  def set_author(name, email)
    @author = {'name' => name, 'email' => email}
  end

  def update_file(file, message, content)
    last_commit_sha = last_commit         # get last commit
    last_tree = tree_for(last_commit_sha) # get base tree
    tree_sha = create_tree(file, content, last_tree) # create new tree
    new_commit_sha = create_commit(message, tree_sha, last_commit_sha) # create new commit
    update_branch(new_commit_sha) # update reference
  end

  private

  def create_tree(file, content, last_tree)
    new_tree = {
      "base_tree" => last_tree,
      "tree" => [{"path" => file, "mode" => "100644", "type" => "blob", "content" => content}]
    }
    Editor.post("/repos/#{@repo}/git/trees", :body => new_tree.to_json).parsed_response['sha']
  end

  def create_commit(message, tree_sha, parent)
    commit = { 'message' => message, 'parents' => [parent], 'tree' => tree_sha }
    if @author
      commit['author'] = @author
    end
    Editor.post("/repos/#{@repo}/git/commits", :body => commit.to_json).parsed_response['sha']
  end

  def update_branch(new)
    ref = {'sha' => new}
    post = Editor.post("/repos/#{@repo}/git/refs/heads/#{@branch}", :body => ref.to_json)
    post.headers['status'] == '200 OK'
  end

end
*/
