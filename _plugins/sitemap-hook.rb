# frozen_string_literal: true

Jekyll::Hooks.register :site, :pre_render do |site|
  (site.pages + site.collections['tabs'].docs).each do |page|
    page.data['sitemap'] = false if page.url.start_with?('/tags/', '/categories/')
  end
end
