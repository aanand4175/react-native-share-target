require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-share-target"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/bicta/react-native-share-target"
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "13.4" }
  s.source       = { :git => "https://github.com/bicta/react-native-share-target.git", :tag => "#{s.version}" }

  s.source_files  = "ios/*.{h,m,mm,swift}"
  s.exclude_files = "ios/template/**"
  s.requires_arc  = true

  s.dependency "React-Core"
end
