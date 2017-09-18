#!/usr/bin/env ruby

require 'json'
require 'net/http'
require 'net/https'
require 'uri'
require 'optparse'
require 'active_support/inflector'
require 'dotenv/load'

class Ampel

  JENKINS_JOBS_URI = URI("#{ENV['JENKINS_JOBS_URI']}/api/json?tree=jobs[name,lastCompletedBuild[number,result]]")
  JENKINS_USER = ENV['JENKINS_USER']
  JENKINS_PASS = ENV['JENKINS_PASS']

  def run(options)
    if evaluate_jenkins_job_colors.size == 0
      toggle_green_light(true, options)
      toggle_red_light(false, options)

      puts "OK: Everything is fine! Green light is on. :-)"
    else
      toggle_green_light(false, options)
      toggle_red_light(true, options)

      puts "ALERT: #{evaluate_jenkins_job_colors.size} failing jenkins #{cpluralize(evaluate_jenkins_job_colors.size, 'job')}! Red light is on. :-("
    end
  end

  def get_jenkins_job_colors
    Net::HTTP.start(
      JENKINS_JOBS_URI.host,
      JENKINS_JOBS_URI.port,
      :use_ssl => JENKINS_JOBS_URI.scheme == 'https',
      :verify_mode => OpenSSL::SSL::VERIFY_NONE
    ) do |http|
      request = Net::HTTP::Get.new JENKINS_JOBS_URI.request_uri
      request.basic_auth JENKINS_USER, JENKINS_PASS

      response = http.request(request)

      return JSON.parse(response.body)
    end
  end

  def evaluate_jenkins_job_colors
    red_jobs = []

    get_jenkins_job_colors['jobs'].each do |job|
      next unless job['lastCompletedBuild']

      # puts "#{job['name']} has status '#{job['lastCompletedBuild']['result']}'"

      red_jobs << job['name'] if job['lastCompletedBuild']['result'] == 'FAILURE'
    end

    return red_jobs
  end

  def toggle_green_light(status, options)
    case status
    when true
      switch = '-o'
    when false
      switch = '-f'
    else
      raise "toggle_green_light: I don't know what to do. Sorry!"
    end

    `sudo sispmctl #{switch} 1` unless options[:dry_run] == true
  end

  def toggle_red_light(status, options)
    case status
    when true
      switch = '-o'
    when false
      switch = '-f'
    else
      raise "toggle_red_light: I don't know what to do. Sorry!"
    end

    `sudo sispmctl #{switch} 2` unless options[:dry_run] == true
  end

  def toggle_siren(status, options)
    case status
    when true
      switch = '-o'
    when false
      switch = '-f'
    else
      raise "toggle_siren: I don't know what to do. Sorry!"
    end

    `sudo sispmctl #{switch} 3` unless options[:dry_run] == true
  end

  def cpluralize(number, text)
    return text.pluralize if number != 1
    return text.singularize if number == 1
  end

end
