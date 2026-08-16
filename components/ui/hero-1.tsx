"use client";

import * as React from "react";
import { Paperclip, Sparkles } from "lucide-react";

const Hero1 = () => {
  return (
    <div className="min-h-screen bg-[#0c0414] text-white flex flex-col relative overflow-x-hidden">
      {/* Gradient — three layered, blurred, skewed bands */}
      <div
        className="flex gap-[10rem] absolute top-[-40rem] right-[-30rem] z-0 blur-[4rem] opacity-50"
        style={{ transform: "rotate(-20deg) skew(-40deg)" }}
      >
        <div className="w-[10rem] h-[20rem] bg-gradient-to-r from-white to-blue-300" />
        <div className="w-[10rem] h-[20rem] bg-gradient-to-r from-white to-blue-300" />
        <div className="w-[10rem] h-[20rem] bg-gradient-to-r from-white to-blue-300" />
      </div>
      <div
        className="flex gap-[10rem] absolute top-[-50rem] right-[-50rem] z-0 blur-[4rem] opacity-50"
        style={{ transform: "rotate(-20deg) skew(-40deg)" }}
      >
        <div className="w-[10rem] h-[20rem] bg-gradient-to-r from-white to-blue-300" />
        <div className="w-[10rem] h-[20rem] bg-gradient-to-r from-white to-blue-300" />
        <div className="w-[10rem] h-[20rem] bg-gradient-to-r from-white to-blue-300" />
      </div>
      <div
        className="flex gap-[10rem] absolute top-[-60rem] right-[-60rem] z-0 blur-[4rem] opacity-50"
        style={{ transform: "rotate(-20deg) skew(-40deg)" }}
      >
        <div className="w-[10rem] h-[30rem] bg-gradient-to-r from-white to-blue-300" />
        <div className="w-[10rem] h-[30rem] bg-gradient-to-r from-white to-blue-300" />
        <div className="w-[10rem] h-[30rem] bg-gradient-to-r from-white to-blue-300" />
      </div>

      {/* Header */}
      <header className="flex justify-between items-center p-6 relative z-10">
        <div className="flex items-center gap-2">
          <img src="https://hextaui.com/logo.svg" width={30} height={30} alt="HextaAI" />
          <div className="font-bold text-md">HextaAI</div>
        </div>
        <button className="bg-white text-black hover:bg-gray-200 rounded-full px-4 py-2 text-sm cursor-pointer font-semibold">
          Get Started
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center relative z-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex-1 flex justify-center">
            <div className="bg-[#1c1528] rounded-full px-4 py-2 flex items-center gap-2 w-fit mx-4">
              <span className="text-xs flex items-center gap-2">
                <span className="bg-black p-1 rounded-full">🥳</span>
                Introducing Magic Components
              </span>
            </div>
          </div>

          <h1 className="text-5xl font-bold leading-tight">
            Build Stunning websites effortlessly
          </h1>

          <p className="text-md">
            HextaAI can create amazing websites with few lines of prompt.
          </p>

          <div className="relative max-w-2xl mx-auto w-full">
            <div className="bg-[#1c1528] rounded-full p-3 flex items-center">
              <button type="button" className="p-2 rounded-full hover:bg-[#2a1f3d] transition-all">
                <Paperclip className="w-5 h-5 text-gray-400" />
              </button>
              <button type="button" className="p-2 rounded-full hover:bg-[#2a1f3d] transition-all">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </button>
              <input
                type="text"
                placeholder="How HextaAI can help you today?"
                className="bg-transparent flex-1 outline-none text-gray-300 ps-4"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-12 max-w-2xl mx-auto">
            <button className="bg-[#1c1528] hover:bg-[#2a1f3d] rounded-full px-4 py-2 text-sm">
              Launch a blog with Astro
            </button>
            <button className="bg-[#1c1528] hover:bg-[#2a1f3d] rounded-full px-4 py-2 text-sm">
              Develop an app using NativeScript
            </button>
            <button className="bg-[#1c1528] hover:bg-[#2a1f3d] rounded-full px-4 py-2 text-sm">
              Build documentation with Vitepress
            </button>
            <button className="bg-[#1c1528] hover:bg-[#2a1f3d] rounded-full px-4 py-2 text-sm">
              Generate UI with shadcn
            </button>
            <button className="bg-[#1c1528] hover:bg-[#2a1f3d] rounded-full px-4 py-2 text-sm">
              Generate UI with HextaUI
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export { Hero1 };
