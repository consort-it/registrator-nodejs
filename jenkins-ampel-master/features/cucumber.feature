Feature: Cucumber Cutting Showcase
  In order to verify that cucumber is installed and configured correctly
  As an Cucumber fan
  I should be able to run this scenario and see that the steps pass (green like a cuke)

  Scenario: Smack a cucumber in the middle
    Given a cucumber that is 30 cm long
    When I cut it exactly in the middle
    Then I have two cucumbers
    And both are 15 cm long

  Scenario: Cutting cucumbers in two halfs
    Given a cucumber that is 30 cm long
    When I cut it in any of two halves
    Then I have two cucumbers
    And one is always more than 14 cm long
