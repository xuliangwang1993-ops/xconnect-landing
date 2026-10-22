<?php
add_theme_support('title-tag');
add_filter('pre_get_document_title', function(){ return 'X-Connect AI — One gateway to every frontier model'; });
// Keep the portal lean: no emoji script, no block CSS on the front page.
remove_action('wp_head','print_emoji_detection_script',7);
remove_action('wp_print_styles','print_emoji_styles');
add_action('wp_enqueue_scripts', function(){ if (is_front_page()) { wp_dequeue_style('wp-block-library'); wp_dequeue_style('global-styles'); wp_dequeue_style('classic-theme-styles'); } }, 100);
