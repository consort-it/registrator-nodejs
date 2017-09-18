require_relative 'spec_helper'
require_relative '../lib/ampel'

describe Ampel do

  subject { described_class.new }

  describe '#cpluralize' do
    it 'returns a singular word if given count is 1' do
      expect(subject.cpluralize(1, 'job')).to eq 'job'
      expect(subject.cpluralize(1, 'job')).not_to eq 'jobs'
    end

    it 'returns a plural word if given count is 2' do
      expect(subject.cpluralize(2, 'job')).to eq 'jobs'
    end

    it 'returns a plural word if given count is 22' do
      expect(subject.cpluralize(22, 'job')).to eq 'jobs'
    end
  end

  describe '#evaluate_jenkins_job_colors' do
    it 'returns an array of job names whose last build failed' do
      # GIVEN
      jenkins_api_response = {
        "_class" => "hudson.model.Hudson", "jobs" => [{
            "_class" => "hudson.model.FreeStyleProject",
            "name" => "job1",
            "lastCompletedBuild" => {
                "_class" => "hudson.model.FreeStyleBuild", "number" => 13, "result" => "SUCCESS"
            }
        }, {
            "_class" => "hudson.model.FreeStyleProject",
            "name" => "job2",
            "lastCompletedBuild" => {
                "_class" => "hudson.model.FreeStyleBuild", "number" => 2058, "result" => "SUCCESS"
            }
        }, {
            "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            "name" => "job3",
            "lastCompletedBuild" => {
                "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowRun", "number" => 63, "result" => "SUCCESS"
            }
        }, {
            "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            "name" => "job4",
            "lastCompletedBuild" => {
                "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowRun", "number" => 476, "result" => "SUCCESS"
            }
        }, {
            "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            "name" => "job5",
            "lastCompletedBuild" => nil
        }, {
            "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            "name" => "job6",
            "lastCompletedBuild" => {
                "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowRun", "number" => 44, "result" => "FAILURE"
            }
        }, {
            "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            "name" => "job7",
            "lastCompletedBuild" => {
                "_class" => "org.jenkinsci.plugins.workflow.job.WorkflowRun", "number" => 15, "result" => "SUCCESS"
            }
        }]
      }

      # WHEN
      allow(subject).to receive(:get_jenkins_job_colors).and_return(jenkins_api_response)

      # THEN
      expect(subject.evaluate_jenkins_job_colors).to eq ["job6"]
      expect(subject.evaluate_jenkins_job_colors.size).to eq 1
    end
  end

  describe '#toggle_green_light' do
    it 'turns the green light on' do
      allow(subject).to receive(:`).with("sudo sispmctl -o 1").and_return true

      expect(subject.toggle_green_light(true, {:dry_run=>false})).to eq true
    end

    it 'turns the green light off' do
      allow(subject).to receive(:`).with("sudo sispmctl -f 1").and_return true

      expect(subject.toggle_green_light(false, {:dry_run=>false})).to eq true
    end

    it 'raises a RuntimeError when neither true or false is provided as status' do
      expect{
        subject.toggle_green_light('fooooo', {:dry_run=>false})
      }.to raise_error(RuntimeError, "toggle_green_light: I don't know what to do. Sorry!")
    end

    it 'does not switch the green light when dry mode is activated' do
      # no mock of system call needed
      expect(subject.toggle_green_light(true, {:dry_run=>true})).to eq nil
    end
  end

  describe '#toggle_red_light' do
    it 'turns the red light on' do
      allow(subject).to receive(:`).with("sudo sispmctl -o 2").and_return true

      expect(subject.toggle_red_light(true, {:dry_run=>false})).to eq true
    end

    it 'turns the red light off' do
      allow(subject).to receive(:`).with("sudo sispmctl -f 2").and_return true

      expect(subject.toggle_red_light(false, {:dry_run=>false})).to eq true
    end

    it 'raises a RuntimeError when neither true or false is provided as status' do
      expect{
        subject.toggle_red_light('fooooo', {:dry_run=>false})
      }.to raise_error(RuntimeError, "toggle_red_light: I don't know what to do. Sorry!")
    end

    it 'does not switch the red light when dry mode is activated' do
      # no mock of system call needed
      expect(subject.toggle_red_light(true, {:dry_run=>true})).to eq nil
    end
  end

  describe '#toggle_siren' do
    it 'turns the siren on' do
      allow(subject).to receive(:`).with("sudo sispmctl -o 3").and_return true

      expect(subject.toggle_siren(true, {:dry_run=>false})).to eq true
    end

    it 'turns the siren off' do
      allow(subject).to receive(:`).with("sudo sispmctl -f 3").and_return true

      expect(subject.toggle_siren(false, {:dry_run=>false})).to eq true
    end

    it 'raises a RuntimeError when neither true or false is provided as status' do
      expect{
        subject.toggle_siren('fooooo', {:dry_run=>false})
      }.to raise_error(RuntimeError, "toggle_siren: I don't know what to do. Sorry!")
    end

    it 'does not switch the siren when dry mode is activated' do
      # no mock of system call needed
      expect(subject.toggle_siren(true, {:dry_run=>true})).to eq nil
    end
  end

  # describe '#get_jenkins_job_colors' do
  #   it 'returns a json from jenkins' do
  #     expect(subject.get_jenkins_job_colors).to respond_to(:each)
  #   end
  # end

  describe '#run' do
    it 'says that everything is fine if we have no failed jobs' do
      options = {:dry_run=>false}

      allow(subject).to receive(:evaluate_jenkins_job_colors).and_return []

      allow(subject).to receive(:toggle_green_light)
      allow(subject).to receive(:toggle_red_light)

      expect do
        subject.run(options)
      end.to output("OK: Everything is fine! Green light is on. :-)\n").to_stdout
    end

    it 'says that we have failed jobs if they exist' do
      options = {:dry_run=>false}

      allow(subject).to receive(:evaluate_jenkins_job_colors).and_return ['foo_job1', 'foo_job2']

      allow(subject).to receive(:toggle_green_light)
      allow(subject).to receive(:toggle_red_light)

      expect do
        subject.run(options)
      end.to output("ALERT: 2 failing jenkins jobs! Red light is on. :-(\n").to_stdout
    end
  end

end
