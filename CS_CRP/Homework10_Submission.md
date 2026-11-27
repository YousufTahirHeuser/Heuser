# Homework 10 Submission: GPIO + Interrupts Arcade

**Course:** CS CRP, Heuser College
**Student:** Yousuf Tahir

## Links

| Item | Link |
|---|---|
| Live website | https://heuser.onrender.com |
| `/embedded` page | https://heuser.onrender.com/embedded |
| Public Wokwi share link | https://wokwi.com/projects/481768134705691649 |
| GitHub repository | https://github.com/YousufTahirHeuser/Heuser |
| `CS_CRP/Homework_9` folder | https://github.com/YousufTahirHeuser/Heuser/tree/main/CS_CRP/Homework_9 |

## Project, technology and coding agent

- **Project chosen:** Project 7, Microsecond Reflex Duel and Simon Game
- **Technology used:** GPIO with hardware interrupts (`attachInterrupt`, `INPUT_PULLUP`) on an ESP32, simulated in Wokwi
- **Coding agent used:** Claude

## Screenshot of the running Wokwi circuit

![Running Wokwi circuit with the Serial Monitor showing reaction times and the interrupt health line](embedded/wokwi_screenshot.png)

## How I pushed the technology to its full extent

All four buttons use their own interrupt service routine that feeds a shared ring-buffer queue, with debouncing and the `micros()` timestamp done inside the ISR at the moment of the press. Both games run on the same interrupt system and handle edge cases such as false starts, near ties, timeouts, wrong answers and keyboard key-repeat. Live counters for raw edges, accepted presses, rejected bounces and dropped events show that no tap was missed.

These same sentences are on the `/embedded` page of my website.
