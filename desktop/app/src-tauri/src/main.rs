// Jangan buka jendela konsol tambahan di Windows (versi rilis)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sma_survey_lib::run()
}
