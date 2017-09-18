Given /^a cucumber that is (\d+) cm long$/ do |length|
  @cucumber = {:color => 'green', :length => length.to_i}
end

When /^I (?:cut|chop) (?:it|the cucumber) exactly in (?:the middle)$/ do
  @choppedCucumbers = [
    {:color => @cucumber[:color], :length => @cucumber[:length] / 2},
    {:color => @cucumber[:color], :length => @cucumber[:length] / 2}
  ]
end

When(/^I (?:cut|chop) (?:it|the cucumber) in any of two halves$/) do
  factor = rand(1.1..1.9).round(1)

  @choppedCucumbers = [
    {:color => @cucumber[:color], :length => @cucumber[:length] / factor},
    {:color => @cucumber[:color], :length => (@cucumber[:length] - (@cucumber[:length] / factor))}
  ]
end

Then /^I have two cucumbers$/ do
  expect(@choppedCucumbers.length).to eq 2
end

Then /^both are (\d+) cm long$/ do |length|
  @choppedCucumbers.each do |cuke|
    expect(cuke[:length]).to eq length.to_i
  end
end

Then(/^one is always more than (\d+) cm long$/) do |length|
  expect(@choppedCucumbers.max_by(&:length)[:length].to_i).to be > length.to_i
end
