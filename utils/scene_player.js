var player_hotkey = {
    Exit: 27,
    Next: 13,
    ToggleLoopingSpeech: 82,
    ToggleSpeechText: 32,
    ToggleNarrativeText: 78,
}

// Setup
_ = function () {
    var player_style_sheet = (
        style = document.createElement("style"),
        document.head.append(style),
        style.type = 'text/css',
        style.id = "player_style",
        style.sheet
    )

    player_style_sheet.insertRule("#player { position: fixed; }")
    player_style_sheet.insertRule("#player { top: 0px; }")
    player_style_sheet.insertRule("#player { left: 0px; }")
    player_style_sheet.insertRule("#player { width: 100%; }")
    player_style_sheet.insertRule("#player { height: 100%; }")
    player_style_sheet.insertRule("#player { background-color: black; }")
    player_style_sheet.insertRule("#player { z-index: 999; }")

    player_style_sheet.insertRule("#player_viewport { position: relative; }")
    player_style_sheet.insertRule("#player_viewport { max-height: 100%; }")
    player_style_sheet.insertRule("#player_viewport { max-width: 100%; }")
    player_style_sheet.insertRule("#player_viewport { aspect-ratio: 16 / 9; }")
    player_style_sheet.insertRule("#player_viewport { transform: translate(calc(50vw - 50%), calc(50vh - 50%)); }")

    player_style_sheet.insertRule("#player_canvas { position: relative; }")
    player_style_sheet.insertRule("#player_canvas { top: 0px; }")
    player_style_sheet.insertRule("#player_canvas { left: 0px; }")
    player_style_sheet.insertRule("#player_canvas { width: 1920px; }")
    player_style_sheet.insertRule("#player_canvas { height: 1080px; }")
    player_style_sheet.insertRule("#player_canvas { overflow: hidden; }")
}()

// Psuedo class
var FrameUpdate = function (on_update) {
    var elapsed_time = 0
    var last_update_time = null
    var is_done = false

    return {
        done: function () {
            is_done = true
        },
        apply: async function (params) {
            return new Promise(
                resolve => {
                    var on_frame = (now) => {
                        // First time
                        (!last_update_time && (last_update_time = now))

                        // 
                        var delta = now - last_update_time
                        last_update_time = now
                        elapsed_time += delta

                        on_update(this, params, {
                            elapsed_time: elapsed_time,
                            delta: delta,
                        })

                        if (!is_done) {
                            window.requestAnimationFrame(on_frame)
                        } else {
                            resolve()
                        }
                    }
                    window.requestAnimationFrame(on_frame)
                }
            )

        }
    }
}
var AudioFadeOutEffect = function (audio) {
    var orig_volume = null
    return Object.assign(
        new EventTarget(),
        FrameUpdate(
            (effect, duration, update_time) => {
                !orig_volume && (orig_volume = audio.volume)
                audio.volume = Math.max(orig_volume * (1 - update_time.elapsed_time / duration), 0)

                if (update_time.elapsed_time >= duration) {
                    audio.volume = 0
                    audio.pause()
                    effect.dispatchEvent(new Event("onfadeend"))
                    effect.done()
                }
            }
        )
    )
}
var DOMObjectFadeEffect = function (node) {
    return Object.assign(
        new EventTarget(),
        FrameUpdate(
            (effect, params, update_time) => {
                var factor = Math.min((update_time.elapsed_time / params.duration), 1)
                if (params.fade == "out") factor = 1.0 - factor

                node.style.opacity = 1.0 * factor
                if (update_time.elapsed_time >= params.duration) {
                    effect.dispatchEvent(new Event("onfadeend"))
                    effect.done()
                }
            }
        )
    )
}

var FlashEffect = function (target) {
    var ret = Object.assign(
        new EventTarget(),
        FrameUpdate(
            (effect, params, update_time) => {
                // First time
                if (!effect_div.parentNode) {
                    target.appendChild(effect_div)
                }

                // Determine state
                if (update_time.elapsed_time < params.in_duration) {
                    transit_state("in")
                } else if (update_time.elapsed_time < params.in_duration + params.out_duration) {
                    if (state == "in" || state == "") {
                        transit_state("cover")
                    }
                    if (state == "cover") {
                        transit_state("out")
                    }
                } else {
                    transit_state("")
                    effect_div.remove()
                    effect.done()
                }

                switch (state) {
                    case "":
                        effect_div.style.opacity = 0
                        break
                    case "in":
                        effect_div.style.opacity = update_time.elapsed_time / params.in_duration
                        break
                    case "out":
                        effect_div.style.opacity = 1 - (update_time.elapsed_time - params.in_duration) / params.out_duration
                        break
                    case "cover":
                        effect_div.style.opacity = 1
                        break
                }
            }
        )
    )

    if (!target) {
        throw "FlashEffect: No target!"
    }

    var state = ""

    var effect_div = document.createElement("div")
    effect_div.style.position = "absolute"
    effect_div.style.top = "0px"
    effect_div.style.left = "0px"
    effect_div.style.width = "100%"
    effect_div.style.height = "100%"
    effect_div.style.backgroundColor = "white"
    effect_div.style.zIndex = "999"

    ret.addEventListener("onreset", () => {
        effect_div.remove()
    })

    function transit_state(next) {
        if (state == next) return

        if (next != "") {
            ret.dispatchEvent(new Event("onflash" + next))
        } else {
            ret.dispatchEvent(new Event("onflashend"))
        }
        state = next
    }

    return ret
}

var ScenePlayer = function (/**async function()**/obtain_scene_content_func) {
    var search_params = new URLSearchParams(window.location.search)

    // Variables
    var ret = Object.assign(
        new EventTarget(),
        {
            play: async function (info) {
                active = true
                reset()

                setup_ui()

                var scene_content = await obtain_scene_content_func(info)
                active && play_scene(scene_content)
            },
            stop: function () {
                update_page_title(PageState.None)
                active = false
                reset()
            }
        }
    )

    var active = false
    var playing_status = {
        reset: function () {
            this["should_loop_speech"] = false
            this["should_display_speech_text"] = (p = search_params.get("speech_text")) ? eval(p) : true
            this["should_display_narrative_text"] = (p = search_params.get("narrative_text")) ? eval(p) : true

            this["bgm"] && this["bgm"].pause()
            this["bgm"] = null

            this["vo"] && this["vo"].pause()
            this["vo"] = null

            this["anim"] && this["anim"].stop()
            this["anim"] = null
        }
    }

    var player_div = document.createElement("div")
    player_div.id = "player"

    var narrative = function () {
        const wait_per_char = 150

        var narrative_div = document.createElement("div")
        narrative_div.style.display = "none"
        narrative_div.style.opacity = 0
        narrative_div.style.position = "absolute"
        narrative_div.style.width = "100%"
        narrative_div.style.height = "100%"
        narrative_div.style.zIndex = "1000"
        narrative_div.style.backgroundColor = "rgba(0, 0, 0, 0.15)"

        var narrative_msg = document.createElement("span")
        narrative_div.appendChild(narrative_msg)
        narrative_msg.className += "narrative"
        narrative_msg.style.position = "absolute"
        narrative_msg.style.opacity = 0
        narrative_msg.style.display = "inline-block"
        narrative_msg.style.maxWidth = "70%"
        narrative_msg.style.width = "fit-content"
        narrative_msg.style.height = "auto"
        narrative_msg.style.fontFamily = "SceneFont"
        narrative_msg.style.fontSize = ((p = search_params.get("narrative_size")) ? p : 1) * 4 + "em"
        narrative_msg.style.lineHeight = "1.2"
        narrative_msg.style.color = "white"
        narrative_msg.style.userSelect = "none"
        narrative_msg.style.top = "50%"
        narrative_msg.style.left = "50%"
        narrative_msg.style.transform = "translate(-50%, -50%)"

        ret.addEventListener("onreset", () => {
            _ = (style = document.querySelector("#player_narrative_style")) && style.remove()

            narrative_msg.innerHTML = ""
            narrative_div.remove()
        })

        ret.addEventListener("onsetupui", () => {
            document.querySelector("#player_narrative_style") || (
                s = document.createElement("style"),
                document.head.append(s),
                s.type = 'text/css',
                s.id = "player_narrative_style",
                style_sheet = s.sheet,
                (
                    style_sheet.insertRule(".narrative:after { content: attr(innerHTML) } "),
                    style_sheet.insertRule(".narrative:after { position: absolute; } "),
                    style_sheet.insertRule(".narrative:after { left: 0px; top: 0px} "),
                    style_sheet.insertRule(".narrative:after { z-index: -1; } "),
                    style_sheet.insertRule(".narrative:after { -webkit-text-stroke: .1em black; } ")
                ),
                s
            )

            document.querySelector("#player_canvas").appendChild(narrative_div)
        })

        return {
            update_message_visibility: function () {
                narrative_div.style.display = playing_status["should_display_narrative_text"] ? null : "none"
                narrative_div.dispatchEvent(new Event("onvisibilityupdate"))
            },
            show: async function (cue) {
                if (!playing_status["should_display_narrative_text"]) {
                    await wait(500)
                    return
                }

                if (narrative_div.style.display == "none") {
                    narrative_div.style.display = null
                    await DOMObjectFadeEffect(narrative_div).apply({
                        fade: "in",
                        duration: 200,
                    })
                } else {
                    await DOMObjectFadeEffect(narrative_msg).apply({
                        fade: "out",
                        duration: 500,
                    })
                }

                narrative_msg.innerHTML = cue["message.text"]
                narrative_msg.setAttribute("innerHTML", narrative_msg.innerHTML)

                await DOMObjectFadeEffect(narrative_msg).apply({
                    fade: "in",
                    duration: 500,
                })

                await async function () {
                    return new Promise(
                        resolve => {
                            var next_listener
                            var on_exit = () => {
                                next_listener.cancel()
                                resolve()
                            }
                            next_listener = listen_on(ret, "onrequestnext", on_exit, { once: true })
                            narrative_div.addEventListener("onvisibilityupdate", () => {
                                if (!playing_status["should_display_narrative_text"]) {
                                    wait(200).then(resolve)
                                }
                            })

                            wait(cue["message.len"] * wait_per_char).
                                then(on_exit)
                        }
                    )
                }()
            },
            hide: async function () {
                await DOMObjectFadeEffect(narrative_msg).apply({
                    fade: "out",
                    duration: 500,
                })
                narrative_msg.innerHTML = ""

                await DOMObjectFadeEffect(narrative_div).apply({
                    fade: "out",
                    duration: 200,
                })
                narrative_div.style.display = "none"
            },
        }
    }()

    var speech = function () {
        const wait_per_char = 200

        var speech_div = document.createElement("div")
        speech_div.style.position = "absolute"
        speech_div.style.maxWidth = "85%"
        speech_div.style.width = "fit-content"
        speech_div.style.height = "auto"
        speech_div.style.bottom = "10%"
        speech_div.style.left = "50%"
        speech_div.style.transform = "translate(-50%, 0%)"
        speech_div.style.zIndex = "1200"

        var speech_msg = document.createElement("span")
        speech_div.appendChild(speech_msg)
        speech_msg.id = "speech"
        speech_msg.style.display = "inline-block"
        speech_msg.style.width = "100%"
        speech_msg.style.height = "auto"
        speech_msg.style.fontFamily = "SceneFont"
        speech_msg.style.fontSize = ((p = search_params.get("speech_size")) ? p : 1) * 4.8 + "em"
        speech_msg.style.lineHeight = "1.2"
        speech_msg.style.userSelect = "none"
        speech_msg.style.lineBreak = "anywhere"
        speech_msg.style.wordBreak = "break-all"
        speech_msg.style.overflowWrap = "break-word"
        speech_msg.style.whiteSpace = "no-wrap"

        ret.addEventListener("onsetupui", () => {
            document.querySelector("#player_speech_style") || (
                style = document.createElement("style"),
                document.head.append(style),
                style.type = 'text/css',
                style.id = "player_speech_style",
                style_sheet = style.sheet,
                (
                    style_sheet.insertRule("#speech:after { content: attr(innerHTML) } "),
                    style_sheet.insertRule("#speech:after { position: absolute; } "),
                    style_sheet.insertRule("#speech:after { left: 0px; top: 0px} "),
                    style_sheet.insertRule("#speech:after { z-index: -1; } "),
                    style_sheet.insertRule("#speech:after { -webkit-text-stroke: 0.1em white; } "),

                    style_sheet.insertRule("#speech.self { color: rgb(60, 60, 60); } "),
                    style_sheet.insertRule("#speech.chara { color: black; } ")
                )
            )

            document.querySelector("#player_canvas").appendChild(speech_div)
        })

        ret.addEventListener("onreset", () => {
            _ = (style = document.querySelector("#player_speech_style")) && style.remove()

            speech_msg.innerHTML = ""
        })

        return {
            update_message_visibility: function () {
                speech_div.style.display = playing_status["should_display_speech_text"] ? null : "none"
            },
            show: async function (cue, content) {
                var data = content.data
                this.update_message_visibility()

                if (cue["chara.name"] == null) { // Self
                    standing.set_spotlight([], true)
                    speech_msg.className = "self"
                } else {
                    standing.set_spotlight(Array.isArray(cue["chara.name"]) ? cue["chara.name"] : [cue["chara.name"]], true)
                    speech_msg.className = "chara"
                }

                speech_msg.innerHTML = cue["message.text"]
                speech_msg.setAttribute("innerHTML", speech_msg.innerHTML)

                function clear() {
                    speech_msg.setAttribute("innerHTML", "")
                    speech_msg.innerHTML = ""
                }
                if (cue["audio"]) {
                    await async function () {
                        return new Promise(
                            resolve => {
                                var next_listener
                                var a = data["vo"][cue["audio"]]
                                var on_exit = () => {
                                    next_listener && next_listener.cancel()
                                    resolve()
                                }

                                playing_status["vo"] = a

                                a.onended = () => {
                                    wait(1000).
                                        then(on_exit)
                                }

                                a.play()

                                next_listener = listen_on(ret, "onrequestnext", () => {
                                    a.pause()
                                    on_exit()
                                }, { once: true })
                            }
                        )
                    }()
                    playing_status["vo"] = null
                } else {
                    await async function () {
                        return new Promise(
                            resolve => {
                                var next_listener
                                var on_exit = () => {
                                    next_listener && next_listener.cancel()
                                    resolve()
                                }
                                next_listener = listen_on(ret, "onrequestnext", on_exit, { once: true })
                                wait(playing_status.should_display_speech_text ?
                                    cue["message.len"] * wait_per_char + 1000 :
                                    1000
                                ).then(on_exit)
                            }
                        )
                    }()
                }
                clear()
            },
            hide: async function () {
                speech_msg.innerHTML = ""
            },
        }
    }()

    var standing = function () {
        var standing_img = {}

        ret.addEventListener("onreset", () => {
            _ = (style = document.querySelector("#player_standing_style")) && style.remove()

            document.querySelectorAll(".standing").forEach(d => d.remove())
        })

        ret.addEventListener("onsetupui", () => {
            document.querySelector("#player_standing_style") || (
                style = document.createElement("style"),
                document.head.append(style),
                style.type = 'text/css',
                style.id = "player_standing_style",

                style_sheet = style.sheet,
                (
                    style_sheet.insertRule(".standing.spotlight { z-index: -100 } "),
                    style_sheet.insertRule(".standing.no-spotlight { z-index: -199 } "),
                    style_sheet.insertRule(".standing.no-spotlight { filter: brightness(50%) } ")
                )
            )
        })

        function put_standing(id, image, scale) {
            (scale === undefined) && (scale = 1)
            standing_img[id] = standing_img[id] || (
                d = document.createElement("img"),
                document.querySelector("#player_canvas").appendChild(d),
                d.id = "standing_" + id,
                d.classList.add("standing"), d.classList.add("no-spotlight"),
                d.style.display = "none",
                d.style.position = "absolute",
                d.style.height = scale * 100 + "em",
                d.style.bottom = "0",
                d.style.left = "50%",
                d.style.transform = "translate(-50%, 50%)",
                d.style.zIndex = "-100",
                d
            )
            standing_img[id].src = image.currentSrc
            standing_img[id].style.display = null
        }

        return {
            show: async function (cue, content) {
                var image = content.data.standing[cue["image"]]
                put_standing(cue["chara.name"] || 0, image, cue["image.scale"])
            },
            set_spotlight: function (chara_names, exclusive) {
                if (!chara_names) { chara_names = Object.keys(standing_img) }

                Object.keys(standing_img).forEach(
                    id => {
                        function spotlight(flag) {
                            if (standing_img[id]) {
                                [...standing_img[id].classList.values()].forEach(c => {
                                    if (c == "spotlight" || c == "no-spotlight") {
                                        standing_img[id].classList.replace(c, flag ? "spotlight" : "no-spotlight")
                                    }
                                })
                            }
                        }
                        if (chara_names.includes(id)) {
                            spotlight(true)
                        } else {
                            if (exclusive) {
                                spotlight(false)
                            }
                        }
                    }
                )
            },
            hide: async function (chara_names) {
                if (chara_names === undefined) { targets = Object.keys(standing_img) }

                chara_names.forEach(
                    id => {
                        if (standing_img[id]) {
                            standing_img[id].remove()
                            standing_img[id] = null
                            delete standing_img[id]
                        }
                    }
                )
            },
        }
    }()

    var anim = function () {
        var anim_div = document.createElement("div")
        anim_div.style.zIndex = 100
        anim_div.style.display = "none"
        anim_div.style.position = "absolute"
        anim_div.style.transform = "translate(-50%, -50%) scale(var(--scale-ratio)) translate(50%, 50%)"

        var rescale_self = function () {
            anim_div.style.setProperty("--scale-ratio", anim_div.parentNode.clientWidth / anim_div.clientWidth)
        }

        window.addEventListener("resize", rescale_self)
        ret.addEventListener("onreset", () => {
            window.removeEventListener("resize", rescale_self)
        })

        ret.addEventListener("onsetupui", () => {
            document.querySelector("#player_canvas").appendChild(anim_div)
        })

        return {
            show: async function (cue, content) {
                var anim_obj = content.data.anim[cue["anim"]]

                playing_status["anim"] && playing_status["anim"].stop()
                playing_status["anim"] = anim_obj

                anim_div.style.display = null
                anim_obj.play(anim_div)
                rescale_self()
            },
            hide: async function () {
                playing_status["anim"] = null

                anim_div.style.display = "none"
                anim_obj.done()
            },
        }
    }()

    // Event listener
    ret.addEventListener("onsetupui", function () {
        var keydown = listen_on(
            window,
            "keydown",
            (e) => {
                if (e.keyCode == player_hotkey.Exit) {
                    ret.stop()
                }
                if (e.keyCode == player_hotkey.ToggleLoopingSpeech) {
                    playing_status.should_loop_speech = !playing_status.should_loop_speech
                    update_page_title(playing_status.should_loop_speech ? PageState.Looping : PageState.None)
                }
                if (e.keyCode == player_hotkey.ToggleSpeechText) {
                    playing_status.should_display_speech_text = !playing_status.should_display_speech_text
                    speech.update_message_visibility()
                }
                if (e.keyCode == player_hotkey.ToggleNarrativeText) {
                    playing_status.should_display_narrative_text = !playing_status.should_display_narrative_text
                    narrative.update_message_visibility()
                }
                if (e.keyCode == player_hotkey.Next) {
                    ret.dispatchEvent(Object.assign(new Event("onrequestnext"), { triggerEvent: e, }))
                }
            }
        )

        listen_on(ret, "onreset", () => {
            keydown.cancel()
        }, { once: true })
    })

    // Private function
    async function wait(duration) {
        return new Promise(
            resolve => {
                setTimeout(
                    () => {
                        resolve()
                    },
                    duration
                )
            }
        )
    }

    function reset() {
        playing_status.reset()

        document.querySelector("#player") && player_div.remove()
        document.body.style.overflow = null

        ret.dispatchEvent(new Event("onreset"))
    }

    function setup_ui() {
        // Basic
        document.body.append(player_div)
        document.body.style.overflow = "hidden"

        var viewport = document.createElement("div")
        viewport.id = "player_viewport"
        player_div.appendChild(viewport)

        var canvas = document.createElement("div")
        canvas.id = "player_canvas"
        viewport.appendChild(canvas)
        canvas.style.transform = "translate(-50%, 0%) scale(var(--scale-ratio)) translate(50%, 0%)"
        var rescale_self = function () {
            canvas.style.setProperty("--scale-ratio", viewport.clientWidth / canvas.clientWidth)
        }
        rescale_self()
        window.addEventListener("resize", rescale_self)
        ret.addEventListener("onreset", () => {
            window.removeEventListener("resize", rescale_self)
        })

        ret.dispatchEvent(new Event("onsetupui"))
    }

    function listen_on(target, event_name, f, options) {
        target.addEventListener(event_name, f, options)
        return {
            cancel: function () {
                target.removeEventListener(event_name, f, options)
            }
        }
    }

    async function play_scene(content) {
        var prev_cue = null
        for (var cue of content.cue) {
            if (!active) return

            if (prev_cue) {
                switch (prev_cue.type) {
                    case "narrative":
                        {
                            if (cue.type != "narrative") {
                                await narrative.hide()
                            }
                        } break
                }
            }

            switch (cue.type) {
                case "bgm":
                    {
                        playing_status.bgm && AudioFadeOutEffect(playing_status.bgm).apply(3000)

                        var a = (playing_status.bgm = content.data.bgm[cue["audio"]])
                        a.volume = cue["volume"] || 1
                        a.loop = cue["loop"] !== undefined ? cue["loop"] : true
                        a.play()

                    } break
                case "narrative":
                    {
                        await narrative.show(cue, content)
                    } break
                case "standing":
                    {
                        standing.show(cue, content)
                    } break
                case "speech":
                    {
                        do {
                            await speech.show(cue, content)
                        } while (playing_status.should_loop_speech)
                    } break
                case "anim":
                    {

                        anim.show(cue, content)
                    } break
                case "effect":
                    {
                        await cue.effect.play(cue, content)
                    } break
            }

            prev_cue = cue
        }

        var keep_pressing_next_listener = listen_on(ret, "onrequestnext", (e) => {
            pressing = e.triggerEvent["repeat"]

            if (!pressing) {
                keep_pressing_next_listener.cancel()
                ret.stop()
            }
        })
    }

    return ret;
}
